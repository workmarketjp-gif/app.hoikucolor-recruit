import { useSignUp } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

function messageFromField(value: unknown): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== 'object') return null;
  const message = (candidate as { message?: unknown }).message;
  return typeof message === 'string' ? message : null;
}

function messageFromError(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const direct = (value as { message?: unknown }).message;
  if (typeof direct === 'string') return direct;
  const errors = (value as { errors?: unknown }).errors;
  if (Array.isArray(errors)) {
    const first = errors[0] as { longMessage?: unknown; message?: unknown } | undefined;
    const text = first?.longMessage ?? first?.message;
    if (typeof text === 'string') return text;
  }
  return null;
}

export default function SignUpScreen() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const router = useRouter();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const busy = fetchStatus === 'fetching';

  const fieldError = useMemo(
    () =>
      messageFromField((errors as any)?.fields?.emailAddress) ??
      messageFromField((errors as any)?.fields?.password) ??
      messageFromField((errors as any)?.fields?.code),
    [errors],
  );

  const sendVerification = async () => {
    const result = await signUp.verifications.sendEmailCode();
    if ((result as any)?.error) throw (result as any).error;
    setVerificationSent(true);
  };

  const onStart = async () => {
    if (!emailAddress.trim() || !password) {
      setLocalError('メールアドレスとパスワードを入力してください。');
      return;
    }
    setLocalError(null);
    const { error } = await signUp.password({ emailAddress: emailAddress.trim(), password });
    if (error) {
      setLocalError(messageFromError(error));
      return;
    }
    try {
      await sendVerification();
    } catch (error) {
      setLocalError(messageFromError(error) ?? '確認コードを送信できませんでした。');
    }
  };

  const onVerify = async () => {
    if (!code.trim()) {
      setLocalError('確認コードを入力してください。');
      return;
    }
    setLocalError(null);
    const result = await signUp.verifications.verifyEmailCode({ code: code.trim() });
    if ((result as any)?.error) {
      setLocalError(messageFromError((result as any).error));
      return;
    }
    if (signUp.status !== 'complete') {
      setLocalError('登録を完了できませんでした。入力内容をご確認ください。');
      return;
    }
    await signUp.finalize();
    router.replace('/(tabs)/home');
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.brand}>Hoiku Color</Text>
        <Text style={styles.title}>{verificationSent ? 'メール確認' : '求職者アカウント作成'}</Text>
        <Text style={styles.description}>
          {verificationSent
            ? `${emailAddress.trim()} に届いた確認コードを入力してください。`
            : 'アカウント作成後、プロフィールや応募書類を登録できます。'}
        </Text>

        {verificationSent ? (
          <>
            <TextInput
              testID="sign-up-code"
              value={code}
              onChangeText={setCode}
              placeholder="確認コード"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              style={styles.input}
            />
            <Pressable testID="sign-up-verify" style={styles.primaryButton} disabled={busy} onPress={() => void onVerify()}>
              {busy ? <ActivityIndicator /> : <Text style={styles.primaryButtonText}>確認して登録</Text>}
            </Pressable>
            <Pressable
              testID="sign-up-resend"
              style={styles.linkButton}
              disabled={busy}
              onPress={() => void sendVerification().catch((error) => setLocalError(messageFromError(error) ?? '再送信できませんでした。'))}
            >
              <Text style={styles.linkText}>確認コードを再送する</Text>
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              testID="sign-up-email"
              value={emailAddress}
              onChangeText={setEmailAddress}
              placeholder="メールアドレス"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              style={styles.input}
            />
            <TextInput
              testID="sign-up-password"
              value={password}
              onChangeText={setPassword}
              placeholder="パスワード"
              secureTextEntry
              textContentType="newPassword"
              style={styles.input}
            />
            <Pressable testID="sign-up-submit" style={styles.primaryButton} disabled={busy} onPress={() => void onStart()}>
              {busy ? <ActivityIndicator /> : <Text style={styles.primaryButtonText}>確認コードを送信</Text>}
            </Pressable>
          </>
        )}

        {localError || fieldError ? <Text style={styles.error}>{localError ?? fieldError}</Text> : null}

        {!verificationSent ? (
          <Pressable testID="go-sign-in" style={styles.linkButton} onPress={() => router.replace('/(auth)/sign-in')}>
            <Text style={styles.linkText}>すでにアカウントをお持ちの方</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f7f8fa' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, gap: 14 },
  brand: { fontSize: 14, fontWeight: '800', letterSpacing: 1.2 },
  title: { fontSize: 27, fontWeight: '800' },
  description: { color: '#5f6670', lineHeight: 21 },
  input: { borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  primaryButton: { minHeight: 50, borderRadius: 12, backgroundColor: '#191c20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  linkButton: { alignItems: 'center', padding: 10 },
  linkText: { fontWeight: '700' },
  error: { color: '#b42318', lineHeight: 20 },
});
