# Android launcher assets

The brand source is `src/logo/logom_hoikucolor.png` in the Web app (identical to
`hoiku-color-mark.png`). `launcher-icon.png` is an opaque 1024×1024 PNG on
`#FFF5F7`; `adaptive-foreground.png` is a transparent 1024×1024 PNG. Both place
the unaltered clover in a centered 440×440 square. Its furthest possible corner
is inside the adaptive icon's central 66/108 safe circle. These are dedicated
launcher assets, not replacements for the UI logo.

Managed Expo prebuild owns Android resources. Do not commit generated `android/`.
CI verifies resolved config, clean prebuild, manifest references, adaptive XML,
background color and every mipmap density. A new APK is required for icon changes.
