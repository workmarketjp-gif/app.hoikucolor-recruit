import { Redirect } from 'expo-router';
// The browser auth session consumes the callback; the auth gate decides the destination.
export default function SsoCallback() { return <Redirect href="/" />; }
