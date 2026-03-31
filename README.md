# Direct File Share

Browser extension project for direct file sharing between two devices using QR code images for setup and WebRTC for peer-to-peer transfer.

## What This Project Does

- Creates a QR code image on the first device
- Lets the second device open that QR code image and generate the next QR code image
- Connects both devices directly with WebRTC
- Sends files in either direction after the connection is ready
- Avoids a custom backend or file upload server for the actual transfer

## Main Files

- `app.html` - extension UI
- `app.js` - connection flow, QR logic, and file transfer logic
- `background.js` - background entry
- `manifest.json` - Chrome manifest
- `manifest.firefox.json` - Firefox manifest
- `manifest.safari.json` - Safari manifest
- `libs/qrcode.min.js` - QR generation library
- `libs/jsQR.js` - QR image decoding library
- `libs/lz-string.min.js` - compressed text payload support
- `icons/` - extension icons

## Load Unpacked / Test Locally

### Chrome

Chrome supports loading an unpacked extension folder directly during development.

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select this project folder
5. Pin the extension if you want easier testing from the toolbar
6. After code changes, use the `Reload` button on the Extensions page

This project already uses the Chrome-ready `manifest.json`, so no manifest swap is needed for Chrome.

### Firefox

Firefox supports temporary loading for testing, but this repo keeps a separate Firefox manifest file.

Before testing in Firefox:

1. Back up the current Chrome manifest if needed
2. Copy `manifest.firefox.json` to `manifest.json`
3. Open `about:debugging#/runtime/this-firefox`
4. Click `Load Temporary Add-on`
5. Select `manifest.json`

Important notes:

- Firefox temporary add-ons are removed when Firefox restarts
- When you switch back to Chrome testing, restore the Chrome `manifest.json`

### Safari

Safari does not use the same `Load unpacked` button flow as Chrome.

For Safari testing:

1. Use the Safari-specific manifest as your active `manifest.json`
2. Use Xcode’s Safari Web Extension packaging flow
3. Build and run the Safari web extension from Xcode for testing

Important notes:

- Safari web extensions are packaged and tested through Apple’s Safari/Xcode workflow
- Apple’s official Safari Web Extensions documentation also notes that Safari supports temporary installation of a web extension folder for testing, but its main supported packaging and distribution flow uses Xcode
- If you plan to publish in Safari, prepare the Safari version through Apple’s packaging process before submission

## Browser Manifest Notes

This repository keeps separate manifest files for browser compatibility:

- Chrome uses `manifest.json`
- Firefox uses `manifest.firefox.json`
- Safari uses `manifest.safari.json`

Before testing or packaging for Firefox or Safari, use the matching manifest as the active `manifest.json`.

## How The Connection Works

1. Device 1 creates the first QR code image
2. Device 2 loads that QR code image
3. Device 2 creates the second QR code image
4. Device 1 loads the second QR code image
5. Both devices connect and can send files directly

If QR image upload is not available in a browser, the text fallback can still be used.

## Notes

- File transfer is direct between devices after setup
- The project currently uses a public STUN server for WebRTC discovery
- There is no custom app server for storing uploaded files

## Publish Checklist

Before submitting to a browser store:

- Verify the correct manifest is in use for that browser
- Test the full QR code image flow on two devices
- Confirm icons load correctly
- Capture store screenshots from the latest UI
- Review store description, privacy details, and screenshots before upload
