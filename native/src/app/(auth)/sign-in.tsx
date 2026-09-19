import { useSignIn } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

type MfaStrategy = 'totp' | 'phone_code' | 'backup_code' | 'email_code';

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

export default function SignInScreen() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfaStrategy, setMfaStrategy] = useState<MfaStrategy | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const busy = fetchStatus === 'fetching';

  const fieldError = useMemo(
    () =>
      messageFromField((errors as any)?.fields?.identifier) ??
      messageFromField((errors as any)?.fields?.password) ??
      messageFromField((errors as any)?.fields?.code),
    [errors],
  );

  const finish = async () => {
    await signIn.finalize();
    router.replace('/(tabs)/home');
  };

  const prepareSecondFactor = async () => {
    const factors = Array.isArray((signIn as any).supportedSecondFactors)
      ? ((signIn as any).supportedSecondFactors as Array<{ strategy?: string }>)
      : [];
    const strategies = new Set(factors.map((factor) => factor.strategy));

    if (strategies.has('totp')) {
      setMfaStrategy('totp');
      return;
    }
    if (strategies.has('phone_code')) {
      const result = await (signIn as any).mfa.sendPhoneCode();
      if (result?.error) throw result.error;
      setMfaStrategy('phone_code');
      return;
    }
    if (strategies.has('email_code')) {
      const result = await (signIn as any).mfa.sendEmailCode();
      if (result?.error) throw result.error;
      setMfaStrategy('email_code');
      return;
    }
    if (strategies.has('backup_code')) {
      setMfaStrategy('backup_code');
      return;
    }
    throw new Error('追加認証の方法を確認できませんでした。Web版でログイン設定をご確認ください。');
  };

  const onSignIn = async () => {
    if (!emailAddress.trim() || !password) {
      setLocalError('メールアドレスとパスワードを入力してください。');
      return;
    }
    setLocalError(null);
    const { error } = await signIn.password({ emailAddress: emailAddress.trim(), password });
    if (error) {
      setLocalError(messageFromError(error));
      return;
    }
    if (signIn.status === 'complete') {
      await finish();
      return;
    }
    if (signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust') {
      try {
        await prepareSecondFactor();
      } catch (error) {
        setLocalError(messageFromError(error) ?? String((error as { message?: unknown })?.message ?? error));
      }
      return;
    }
    setLocalError('ログインを完了できませんでした。認証設定をご確認ください。');
  };

  const onVerifyMfa = async () => {
    if (!mfaStrategy || !code.trim()) return;
    setLocalError(null);
    let result: any;
    if (mfaStrategy === 'totp') result = await (signIn as any).mfa.verifyTOTP({ code: code.trim() });
    if (mfaStrategy === 'phone_code') result = await (signIn as any).mfa.verifyPhoneCode({ code: code.trim() });
    if (mfaStrategy === 'email_code') result = await (signIn as any).mfa.verifyEmailCode({ code: code.trim() });
    if (mfaStrategy === 'backup_code') result = await (signIn as any).mfa.verifyBackupCode({ code: code.trim() });
    if (result?.error) {
      setLocalError(messageFromError(result.error));
      return;
    }
    if (signIn.status === 'complete') {
      await finish();
      return;
    }
    setLocalError('追加認証を完了できませんでした。コードを確認してください。');
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.brand}>Hoiku Color</Text>
        <Text style={styles.title}>{mfaStrategy ? '追加認証' : '求職者ログイン'}</Text>
        <Text style={styles.description}>
          {mfaStrategy ? '本人確認コードを入力してください。' : '求人・応募・連絡をスマホから確認できます。'}
        </Text>

        {mfaStrategy ? (
          <>
            <TextInput
              testID="sign-in-mfa-code"
              value={code}
              onChangeText={setCode}
              placeholder={mfaStrategy === 'backup_code' ? 'バックアップコード' : '認証コード'}
              autoCapitalize="none"
              keyboardType={mfaStrategy === 'backup_code' ? 'default' : 'number-pad'}
              style={styles.input}
            />
            <Pressable testID="sign-in-mfa-submit" style={styles.primaryButton} disabled={busy} onPress={() => void onVerifyMfa()}>
              {busy ? <ActivityIndicator /> : <Text style={styles.primaryButtonText}>確認する</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              testID="sign-in-email"
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
              testID="sign-in-password"
              value={password}
              onChangeText={setPassword}
              placeholder="パスワード"
              secureTextEntry
              textContentType="password"
              style={styles.input}
            />
            <Pressable testID="sign-in-submit" style={styles.primaryButton} disabled={busy} onPress={() => void onSignIn()}>
              {busy ? <ActivityIndicator /> : <Text style={styles.primaryButtonText}>ログイン</Text>}
            </Pressable>
          </>
        )}

        {localError || fieldError ? <Text style={styles.error}>{localError ?? fieldError}</Text> : null}

        {!mfaStrategy ? (
          <Pressable testID="go-sign-up" style={styles.linkButton} onPress={() => router.push('/(auth)/sign-up')}>
            <Text style={styles.linkText}>初めての方はこちら</Text>
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
  title: { fontSize: 28, fontWeight: '800' },
  description: { color: '#5f6670', lineHeight: 21 },
  input: { borderWidth: 1, borderColor: '#d7dce2', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  primaryButton: { minHeight: 50, borderRadius: 12, backgroundColor: '#191c20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  linkButton: { alignItems: 'center', padding: 10 },
  linkText: { fontWeight: '700' },
  error: { color: '#b42318', lineHeight: 20 },
});
