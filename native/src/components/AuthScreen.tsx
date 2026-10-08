import { useSignIn, useSignUp, useSSO } from '@clerk/expo';
import { useRouter } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { ActivityIndicator, Image, useWindowDimensions, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

WebBrowser.maybeCompleteAuthSession();
type MfaStrategy = 'totp' | 'phone_code' | 'backup_code' | 'email_code';
function messageFromError(value: unknown): string {
  const error = value as { message?: string; errors?: Array<{ longMessage?: string; message?: string }> } | null;
  return error?.errors?.[0]?.longMessage ?? error?.errors?.[0]?.message ?? error?.message ?? '認証を完了できませんでした。もう一度お試しください。';
}
function errorCode(value: unknown): string | undefined {
  const error = value as { code?: string; errors?: Array<{ code?: string }> } | null;
  return error?.errors?.[0]?.code ?? error?.code;
}
export function AuthScreen({ isSignup = false }: { isSignup?: boolean }) {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  const narrow = useWindowDimensions().width <= 390;
  const [emailAddress, setEmailAddress] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [mfaStrategy, setMfaStrategy] = useState<MfaStrategy | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setLocalError(null);
    try { await action(); } catch (error) { setLocalError(messageFromError(error)); }
    finally { submitting.current = false; setBusy(false); }
  };
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


  const onVerifyMfa = async () => {
    if (!mfaStrategy || !code.trim()) throw new Error('確認コードを入力してください。');
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

  const startEmail = async () => {
    const email = emailAddress.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('メールアドレスを入力してください。');
    const result = await signIn.create({ identifier: email, signUpIfMissing: true });
    if (result.error) throw result.error;
    const sent = await signIn.emailCode.sendCode();
    if (sent.error) throw sent.error;
    setStep('code');
  };
  const verifyEmail = async () => {
    if (!code.trim()) throw new Error('確認コードを入力してください。');
    const result = await signIn.emailCode.verifyCode({ code: code.trim() });
    if (result.error) {
      if (errorCode(result.error) !== 'sign_up_if_missing_transfer') throw result.error;
      const transferred = await signUp.create({ transfer: true });
      if (transferred.error) throw transferred.error;
      if (signUp.status !== 'complete') throw new Error('アカウント作成に追加情報が必要です。Googleログインをお試しいただくか、お問い合わせください。');
      await signUp.finalize();
      router.replace('/(tabs)/home');
      return;
    }
    if (signIn.status === 'complete') { await finish(); return; }
    if (signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust') {
      await prepareSecondFactor(); setCode(''); return;
    }
    throw new Error('ログインを完了できませんでした。もう一度お試しください。');
  };
  const startGoogle = async () => {
    const result = await startSSOFlow({ strategy: 'oauth_google', redirectUrl: AuthSession.makeRedirectUri({ scheme: 'hoikucolor', path: 'sso-callback' }) });
    if (result.createdSessionId && result.setActive) {
      await result.setActive({ session: result.createdSessionId });
      router.replace('/(tabs)/home');
    } else if (result.authSessionResult?.type !== 'cancel' && result.authSessionResult?.type !== 'dismiss') {
      throw new Error('Googleログインを完了できませんでした。メールアドレスで続けるか、もう一度お試しください。');
    }
  };
  const resetEmail = async () => {
    await signIn.reset(); setCode(''); setStep('email'); setMfaStrategy(null);
  };
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={[styles.page, narrow && { paddingHorizontal: 18 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <Image source={require('../../assets/hoiku-color-logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="Hoiku Color" />
            <View style={styles.role}><Text style={styles.roleText}>求職者専用</Text></View>
            <Text style={styles.eyebrow}>求職者</Text>
            <Text style={[styles.title, narrow && { fontSize: 25 }]}>{isSignup ? '求職者アカウントを作成' : '求職者ログイン'}</Text>
            <Text style={styles.description}>Googleアカウントまたはメールアドレスで続けられます。</Text>
            {step === 'email' ? <>
              <Pressable accessibilityRole="button" testID="auth-google" disabled={busy} style={styles.googleButton} onPress={() => void run(startGoogle)}>
                <Image source={require('../../assets/google-g.png')} style={styles.googleMark} />
                <Text style={styles.googleText}>Googleで続ける</Text>
              </Pressable>
              <View style={styles.divider}><View style={styles.line}/><Text style={styles.or}>または</Text><View style={styles.line}/></View>
              <Text style={styles.label}>メールアドレス</Text>
              <TextInput testID={isSignup ? 'sign-up-email' : 'sign-in-email'} accessibilityLabel="メールアドレス" value={emailAddress} onChangeText={setEmailAddress} placeholder="name@example.jp" placeholderTextColor="#b0b6bf" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" editable={!busy} style={styles.input} onSubmitEditing={() => void run(startEmail)} />
            </> : <>
              <View style={styles.codeCopy}><Text style={styles.label}>{mfaStrategy ? '追加認証' : '確認コードを入力'}</Text><Text style={styles.description}>{mfaStrategy ? '本人確認コードを入力してください。' : emailAddress.trim() + ' に送信した6桁のコードを入力してください。'}</Text></View>
              <Text style={styles.label}>{mfaStrategy === 'backup_code' ? 'バックアップコード' : '確認コード'}</Text>
              <TextInput testID="auth-code" accessibilityLabel="確認コード" value={code} onChangeText={setCode} placeholder="000000" autoCapitalize="none" autoCorrect={false} keyboardType={mfaStrategy === 'backup_code' ? 'default' : 'number-pad'} textContentType="oneTimeCode" autoComplete="one-time-code" editable={!busy} style={[styles.input, styles.codeInput]} onSubmitEditing={() => void run(mfaStrategy ? onVerifyMfa : verifyEmail)} />
            </>}
            {localError ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{localError}</Text> : null}
            <Pressable accessibilityRole="button" testID="auth-submit" disabled={busy} style={[styles.primaryButton, busy && styles.disabled]} onPress={() => void run(step === 'email' ? startEmail : mfaStrategy ? onVerifyMfa : verifyEmail)}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{step === 'email' ? 'メールで続ける' : '確認して続ける'}</Text>}
            </Pressable>
            {step === 'code' ? <View style={styles.codeActions}>
              {!mfaStrategy ? <Pressable testID="auth-resend" accessibilityRole="button" disabled={busy} style={styles.linkButton} onPress={() => void run(async () => { const result = await signIn.emailCode.sendCode(); if (result.error) throw result.error; })}><Text style={styles.secondaryText}>コードを再送</Text></Pressable> : null}
              <Pressable testID="auth-change-email" accessibilityRole="button" disabled={busy} style={styles.linkButton} onPress={() => void run(resetEmail)}><Text style={styles.secondaryText}>メールアドレスを変更</Text></Pressable>
            </View> : null}
            <View style={styles.footer}>
              <Pressable accessibilityRole="link" disabled={busy} style={styles.linkButton} onPress={() => router.replace(isSignup ? '/(auth)/sign-in' : '/(auth)/sign-up')}><Text style={styles.linkText}>{isSignup ? 'すでにアカウントをお持ちの方' : 'アカウントをお持ちでない方'}</Text></Pressable>
              <Pressable accessibilityRole="link" disabled={busy} style={styles.linkButton} onPress={() => void run(async () => { await Linking.openURL('https://app.hoikupoppy.ai'); })}><Text style={styles.secondaryText}>園・法人の方はこちら</Text></Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  page: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 28, paddingBottom: 34, alignItems: 'center' },
  content: { width: '100%', maxWidth: 500 },
  logo: { width: 175, height: 44, marginBottom: 38 },
  role: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e6e2e0', borderRadius: 12, backgroundColor: '#faf9f8', marginBottom: 26 },
  roleText: { color: '#ed274b', fontSize: 12, fontWeight: '900' },
  eyebrow: { color: '#fb2f52', fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: '#17253a', fontSize: 27, fontWeight: '900', marginTop: 9, marginBottom: 8 },
  description: { color: '#8992a0', fontSize: 15, lineHeight: 23 },
  googleButton: { minHeight: 52, marginTop: 24, borderWidth: 1, borderColor: '#dfe2e7', borderRadius: 11, flexDirection: 'row', gap: 11, alignItems: 'center', justifyContent: 'center', padding: 12 },
  googleMark: { width: 22, height: 22 }, googleText: { color: '#2f3d50', fontSize: 16, fontWeight: '800' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 20 }, line: { height: 1, flex: 1, backgroundColor: '#e8eaed' }, or: { color: '#9aa2ad', fontSize: 10 },
  label: { color: '#334053', fontSize: 15, fontWeight: '800', marginBottom: 9 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#dfe2e7', borderRadius: 11, paddingHorizontal: 14, paddingVertical: 12, color: '#263447', fontSize: 16 },
  primaryButton: { minHeight: 52, borderRadius: 11, backgroundColor: '#ed274b', alignItems: 'center', justifyContent: 'center', padding: 12, marginTop: 16 }, primaryText: { color: '#fff', fontSize: 16, fontWeight: '900' }, disabled: { opacity: 0.58 },
  codeCopy: { marginTop: 24, marginBottom: 14, padding: 16, borderWidth: 1, borderColor: '#f0e2e5', backgroundColor: '#fff8fa', borderRadius: 11 }, codeInput: { textAlign: 'center', letterSpacing: 4, fontSize: 18 },
  error: { marginTop: 10, padding: 12, borderRadius: 9, backgroundColor: '#fff4f6', color: '#9d3449', fontSize: 15, lineHeight: 23 },
  codeActions: { marginTop: 3 }, footer: { marginTop: 22 }, linkButton: { minHeight: 44, justifyContent: 'center', paddingVertical: 10 }, linkText: { color: '#c03a54', fontSize: 12, fontWeight: '800' }, secondaryText: { color: '#87909c', fontSize: 12, fontWeight: '800' },
});
