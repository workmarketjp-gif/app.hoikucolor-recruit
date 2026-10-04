import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json stays the static source of truth; Expo passes it in as `config`.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  extra: {
    ...config.extra,
    EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID,
    EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID,
    EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID: process.env.EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID,
    EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME: process.env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME,
    EXPO_PUBLIC_PRIVACY_POLICY_URL: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
    EXPO_PUBLIC_TERMS_URL: process.env.EXPO_PUBLIC_TERMS_URL,
    EXPO_PUBLIC_ACCOUNT_DELETION_URL: process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL,
    EXPO_PUBLIC_SUPPORT_URL: process.env.EXPO_PUBLIC_SUPPORT_URL,
  },
});
