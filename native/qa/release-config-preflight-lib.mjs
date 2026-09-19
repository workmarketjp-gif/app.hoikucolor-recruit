import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_PLUGINS = ['expo-router', 'expo-secure-store', 'expo-local-authentication', '@clerk/expo', 'expo-notifications', 'expo-image-picker'];
const GOOGLE_ID_RE = /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLACEHOLDER_RE = /(^|[_\s])(set|todo|replace|placeholder|example)([_\s]|$)|your[-_]/i;

function parseDotEnv(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

export function loadEnvFile(filePath) {
  if (!filePath) return {};
  if (!fs.existsSync(filePath)) throw new Error(`ENV_FILE_NOT_FOUND:${filePath}`);
  return parseDotEnv(fs.readFileSync(filePath, 'utf8'));
}

function pluginEntryName(entry) {
  return Array.isArray(entry) ? entry[0] : entry;
}

function pluginEntryOptions(entry) {
  return Array.isArray(entry) ? entry[1] ?? {} : {};
}

function validHttps(raw) {
  if (!raw || PLACEHOLDER_RE.test(raw)) return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function nonPlaceholder(raw) {
  return Boolean(raw && raw.trim() && !PLACEHOLDER_RE.test(raw));
}

function expectedGoogleIosScheme(iosClientId) {
  if (!GOOGLE_ID_RE.test(iosClientId ?? '')) return null;
  return `com.googleusercontent.apps.${iosClientId.slice(0, -'.apps.googleusercontent.com'.length)}`;
}

export function validateReleaseConfig({ rootDir, env, mode = 'production' }) {
  const app = JSON.parse(fs.readFileSync(path.join(rootDir, 'app.json'), 'utf8'));
  const eas = JSON.parse(fs.readFileSync(path.join(rootDir, 'eas.json'), 'utf8'));
  const appConfigSource = fs.readFileSync(path.join(rootDir, 'app.config.ts'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const expo = app.expo ?? {};
  const errors = [];
  const warnings = [];
  const checks = [];

  const check = (condition, code, message) => {
    checks.push({ code, pass: Boolean(condition), message });
    if (!condition) errors.push(`${code}: ${message}`);
  };
  const warn = (condition, code, message) => {
    checks.push({ code, pass: Boolean(condition), warning: true, message });
    if (!condition) warnings.push(`${code}: ${message}`);
  };

  check(expo.name === 'Hoiku Color', 'APP_NAME', 'Store app name must remain Hoiku Color.');
  check(expo.slug === 'hoiku-color-jobseeker', 'APP_SLUG', 'Expo slug must remain the dedicated jobseeker app slug.');
  check(expo.scheme === 'hoikucolor', 'APP_SCHEME', 'Dedicated deep-link scheme must be hoikucolor.');
  check(expo.ios?.bundleIdentifier === 'jp.hoikucolor.jobseeker', 'IOS_BUNDLE_ID', 'iOS bundle identifier must be the independent jobseeker app id.');
  check(expo.android?.package === 'jp.hoikucolor.jobseeker', 'ANDROID_PACKAGE', 'Android package must be the independent jobseeker app id.');
  check(/^\d+(?:\.\d+){2}$/.test(expo.version ?? ''), 'APP_VERSION', 'App version must be x.y.z.');
  check(/^\d+$/.test(String(expo.ios?.buildNumber ?? '')) && Number(expo.ios?.buildNumber) > 0, 'IOS_BUILD_NUMBER', 'iOS build number must be a positive integer string.');
  check(Number.isInteger(expo.android?.versionCode) && expo.android.versionCode > 0, 'ANDROID_VERSION_CODE', 'Android versionCode must be a positive integer.');

  const plugins = expo.plugins ?? [];
  for (const required of REQUIRED_PLUGINS) {
    check(plugins.some((entry) => pluginEntryName(entry) === required), `PLUGIN_${required.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`, `${required} config plugin is required.`);
  }
  const clerkPlugin = plugins.find((entry) => pluginEntryName(entry) === '@clerk/expo');
  check(Boolean(clerkPlugin) && pluginEntryOptions(clerkPlugin).appleSignIn !== false, 'CLERK_APPLE_SIGN_IN_PLUGIN', 'Clerk plugin must keep Apple Sign-In enabled for the iOS Store path.');
  check(expo.ios?.usesAppleSignIn === true, 'IOS_APPLE_SIGN_IN_ENTITLEMENT', 'iOS usesAppleSignIn must be enabled.');
  const imagePickerPlugin = plugins.find((entry) => pluginEntryName(entry) === 'expo-image-picker');
  check(Boolean(imagePickerPlugin) && typeof pluginEntryOptions(imagePickerPlugin).cameraPermission === 'string' && pluginEntryOptions(imagePickerPlugin).cameraPermission.length > 0, 'IMAGE_PICKER_CAMERA_PERMISSION', 'Camera capture must provide a reviewed camera permission description.');
  check(Boolean(imagePickerPlugin) && pluginEntryOptions(imagePickerPlugin).microphonePermission === false, 'IMAGE_PICKER_NO_MICROPHONE', 'Document camera capture must not request microphone permission.');

  const projectId = String(expo.extra?.eas?.projectId ?? '');
  check(UUID_RE.test(projectId) && !PLACEHOLDER_RE.test(projectId), 'EAS_PROJECT_ID', 'EAS projectId must be the real UUID; placeholders are release blockers.');
  check(eas.build?.production?.distribution === 'store', 'EAS_PRODUCTION_DISTRIBUTION', 'Production EAS profile must target store distribution.');
  check(!Object.hasOwn(eas.build ?? {}, 'preview'), 'NO_PREVIEW_PROFILE', 'Prepared release config must not add a Preview build path; Store/Release Gates own publication.');

  const requiredAppConfigEnv = [
    'EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID',
    'EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID',
    'EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID',
    'EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME',
    'EXPO_PUBLIC_PRIVACY_POLICY_URL',
    'EXPO_PUBLIC_TERMS_URL',
    'EXPO_PUBLIC_ACCOUNT_DELETION_URL',
    'EXPO_PUBLIC_SUPPORT_URL',
  ];
  for (const key of requiredAppConfigEnv) {
    check(appConfigSource.includes(`${key}: process.env.${key}`), `APP_CONFIG_${key}`, `${key} must be copied into Expo extra for native/EAS runtime consumers.`);
  }

  const clerkKey = env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const supabaseKey = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  const contractVersion = env.EXPO_PUBLIC_CLIENT_CONTRACT_VERSION ?? '';
  check(nonPlaceholder(clerkKey) && (mode !== 'production' || clerkKey.startsWith('pk_live_')), 'CLERK_PUBLISHABLE_KEY', mode === 'production' ? 'Production release requires a non-placeholder Clerk pk_live_ publishable key.' : 'Clerk publishable key is required.');
  check(validHttps(supabaseUrl), 'SUPABASE_URL', 'Supabase URL must be a non-placeholder HTTPS URL without credentials.');
  check(nonPlaceholder(supabaseKey), 'SUPABASE_PUBLISHABLE_KEY', 'Supabase publishable key is required and must not be a placeholder.');
  check(/^\d+$/.test(contractVersion) && Number(contractVersion) > 0, 'CLIENT_CONTRACT_VERSION', 'Client contract version must be a positive integer.');

  const googleWeb = env.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID ?? '';
  const googleIos = env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID ?? '';
  const googleAndroid = env.EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID ?? '';
  const googleIosScheme = env.EXPO_PUBLIC_CLERK_GOOGLE_IOS_URL_SCHEME ?? '';
  check(GOOGLE_ID_RE.test(googleWeb) && !PLACEHOLDER_RE.test(googleWeb), 'GOOGLE_WEB_CLIENT_ID', 'Google Web client ID is required for Clerk token verification.');
  check(GOOGLE_ID_RE.test(googleIos) && !PLACEHOLDER_RE.test(googleIos), 'GOOGLE_IOS_CLIENT_ID', 'Google iOS client ID is required for native iOS sign-in.');
  check(GOOGLE_ID_RE.test(googleAndroid) && !PLACEHOLDER_RE.test(googleAndroid), 'GOOGLE_ANDROID_CLIENT_ID', 'Google Android client ID is required for native Android sign-in.');
  const expectedIosScheme = expectedGoogleIosScheme(googleIos);
  check(Boolean(expectedIosScheme) && googleIosScheme === expectedIosScheme, 'GOOGLE_IOS_URL_SCHEME', 'iOS Google URL scheme must exactly match the iOS client ID reverse scheme.');

  if (mode === 'production') {
    for (const [key, label] of [
      ['EXPO_PUBLIC_PRIVACY_POLICY_URL', 'Privacy Policy'],
      ['EXPO_PUBLIC_TERMS_URL', 'Terms'],
      ['EXPO_PUBLIC_ACCOUNT_DELETION_URL', 'Account deletion resource'],
      ['EXPO_PUBLIC_SUPPORT_URL', 'Support'],
    ]) {
      check(validHttps(env[key]), key, `${label} must be a live-looking HTTPS URL without credentials.`);
    }
  } else {
    for (const key of ['EXPO_PUBLIC_PRIVACY_POLICY_URL', 'EXPO_PUBLIC_TERMS_URL', 'EXPO_PUBLIC_ACCOUNT_DELETION_URL', 'EXPO_PUBLIC_SUPPORT_URL']) {
      warn(!env[key] || validHttps(env[key]), `DEV_${key}`, `${key}, when set, must be HTTPS.`);
    }
  }

  check(!('react-native-webview' in (pkg.dependencies ?? {})), 'NO_WEBVIEW_DEPENDENCY', 'The jobseeker app must remain a mobile-native UI, not a WebView shell.');
  check(pkg.dependencies?.['@clerk/expo'], 'CLERK_DEPENDENCY', '@clerk/expo dependency is required.');
  check(pkg.dependencies?.['expo-notifications'], 'NOTIFICATIONS_DEPENDENCY', 'expo-notifications dependency is required.');
  check(pkg.dependencies?.['expo-local-authentication'], 'LOCAL_AUTH_DEPENDENCY', 'expo-local-authentication dependency is required.');
  check(pkg.dependencies?.['expo-image-picker'], 'IMAGE_PICKER_DEPENDENCY', 'expo-image-picker dependency is required for direct document camera capture.');

  return { mode, pass: errors.length === 0, errors, warnings, checks };
}
