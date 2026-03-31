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

## Local Testing

### Chrome

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this project folder

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click `Load Temporary Add-on`
3. Use the Firefox-specific manifest when packaging or testing

### Safari

Safari uses its own extension packaging flow. Use the Safari-specific manifest when preparing the project for Safari.

## Browser Manifest Notes

This repository keeps separate manifest files for browser compatibility:

- Chrome uses `manifest.json`
- Firefox uses `manifest.firefox.json`
- Safari uses `manifest.safari.json`

Before packaging for Firefox or Safari, use the matching manifest as the active `manifest.json`.

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
