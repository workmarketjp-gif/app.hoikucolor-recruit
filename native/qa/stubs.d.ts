declare const process: { env: Record<string, string | undefined> };
declare module 'react' {
  export function useState<T>(initial: T | (() => T)): [T, (value: T | ((current: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: unknown[]): T;
  export function useRef<T>(initial: T): { current: T };
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps: unknown[]): T;
  export interface Context<T> { __type?: T; Provider: any }
  export function useContext<T>(ctx: Context<T>): T;
  export function createContext<T>(value: T): Context<T>;
  export type PropsWithChildren<T = {}> = T & { children?: any };
  export type ReactNode = any;
  export type ComponentProps<T> = any;
}
declare module 'react/jsx-runtime' { export const jsx:any; export const jsxs:any; export const Fragment:any; }
declare module '@clerk/expo' { export const ClerkProvider:any; export const useAuth:any; export const useSignIn:any; export const useSignUp:any; export const useClerk:any; export const useUser:any; export const useSession:any; }
declare module '@clerk/expo/token-cache' { export const tokenCache:any; }
declare module '@supabase/supabase-js' { export type SupabaseClient = any; export const createClient:any; }
declare module 'expo-router' { export const Stack:any; export const Tabs:any; export const Redirect:any; export const useRouter:any; export function useLocalSearchParams<T>(): T; }
declare module 'expo-application' { export const nativeBuildVersion:string|null; export const nativeApplicationVersion:string|null; }
declare module 'expo-notifications' { export const AndroidImportance:any; export const IosAuthorizationStatus:any; export const setNotificationHandler:any; export const setNotificationChannelAsync:any; export const getPermissionsAsync:any; export const requestPermissionsAsync:any; export const getExpoPushTokenAsync:any; export const addPushTokenListener:any; export const addNotificationResponseReceivedListener:any; export const addNotificationReceivedListener:any; export const getLastNotificationResponseAsync:any; export const clearLastNotificationResponseAsync:any; export const setBadgeCountAsync:any; export const unregisterForNotificationsAsync:any; export const dismissAllNotificationsAsync:any; }
declare module 'expo-device' { export const isDevice:boolean; }
declare module 'expo-secure-store' { export const getItemAsync:any; export const setItemAsync:any; export const deleteItemAsync:any; export const isAvailableAsync:any; }
declare module 'expo-constants' { const Constants:any; export default Constants; }
declare module 'expo-crypto' { export const randomUUID:() => string; export const digestStringAsync:any; export const CryptoDigestAlgorithm:{SHA256:string}; }
declare module 'expo-image-picker' { export const requestCameraPermissionsAsync:any; export const launchCameraAsync:any; export const getPendingResultAsync:any; export const CameraType:any; export type ImagePickerAsset = { uri:string; fileName?:string|null; fileSize?:number|null; mimeType?:string|null; width?:number; height?:number; type?:string|null }; }
declare module 'expo-document-picker' { export type DocumentPickerAsset = { uri:string; name:string; size?:number; mimeType?:string; lastModified?:number; file?:any }; export const getDocumentAsync:any; }
declare module 'expo-file-system' { export const Paths:{document:any; cache:any}; export class File { constructor(...parts:any[]); exists:boolean; create(options?:any):void; write(content:string|Uint8Array):void; text():Promise<string>; arrayBuffer():Promise<ArrayBuffer>; delete():void; } }
declare module 'expo-screen-capture' { export const isAvailableAsync:any; export const preventScreenCaptureAsync:any; export const allowScreenCaptureAsync:any; export const enableAppSwitcherProtectionAsync:any; export const disableAppSwitcherProtectionAsync:any; }
declare module 'expo-local-authentication' { export const AuthenticationType:any; export const SecurityLevel:any; export const hasHardwareAsync:any; export const isEnrolledAsync:any; export const getEnrolledLevelAsync:any; export const supportedAuthenticationTypesAsync:any; export const authenticateAsync:any; export const cancelAuthenticate:any; }
declare module 'react-native' { export const ActivityIndicator:any; export const Alert:any; export const Button:any; export const FlatList:any; export const Pressable:any; export const ScrollView:any; export const StyleSheet:any; export const SafeAreaView:any; export const Switch:any; export const Text:any; export const TextInput:any; export const View:any; export const Platform:{OS:string}; export const Linking:any; export const AppState:any; export type AppStateStatus = 'active'|'background'|'inactive'|'unknown'|'extension'; export type LayoutChangeEvent = any; }
declare module 'react-native-url-polyfill/auto';

declare module '@clerk/expo/native' { export const AuthView:any; }
