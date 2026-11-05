# Vendored LiveKit browser SDK

This directory contains the license notice for the upstream LiveKit JavaScript client.

- Package: `livekit-client`
- Pinned version: `2.23.0`
- Upstream source: https://github.com/livekit/client-sdk-js/tree/v2.23.0
- Package registry: https://www.npmjs.com/package/livekit-client/v/2.23.0
- License: Apache-2.0 (see [LICENSE](./LICENSE))
- Expected browser artifact: `livekit-client-2.23.0.umd.js`
- Expected loader path: `vendor/livekit/livekit-client-2.23.0.umd.js`

## Artifact inspection record

On 2026-10-30, the package tarball was obtained from the versioned npm registry URL:

`https://registry.npmjs.org/livekit-client/-/livekit-client-2.23.0.tgz`

Inspection confirmed:
- Package metadata name/version: `livekit-client@2.23.0`
- Package metadata license: `Apache-2.0`
- Exact artifact path in tarball: `package/dist/livekit-client.umd.js`
- Extracted artifact size: `610302` bytes
- Extracted artifact SHA-256: `fb646f2260d84f91238d0a2dc10726c456631d6a26c7cafc43cfee5959b4d31d`
- Tarball size: `2992351` bytes
- Locally computed tarball SRI: `sha512-j9Kg86nJjBjNFUD+ukp2jwMCGa0k+YD5gU//RzAM+ZY3pbG631QCte7fQjwqWMmtBzhDJL9nKYuOLMv/9IbAxg==`
- Extracted artifact is byte-for-byte identical to the supplied tarball member.
- `node --check` passes for the extracted UMD artifact.

**Registry integrity verified:** npm reports the exact version's tarball SRI as `sha512-j9Kg86nJjBjNFUD+ukp2jwMCGa0k+YD5gU//RzAM+ZY3pbG631QCte7fQjwqWMmtBzhDJL9nKYuOLMv/9IbAxg==`, matching the independently computed value. The committed UMD artifact is 610302 bytes with SHA-256 `fb646f2260d84f91238d0a2dc10726c456631d6a26c7cafc43cfee5959b4d31d`.

The artifact is loaded lazily after an explicit call action. It is deliberately **not precached during app installation**, so it does not delay ordinary startup. After its first successful fetch, the service worker's same-origin code-asset cache makes it available for subsequent offline use.

No CDN fallback is permitted. The feature remains disabled by default until real-device and network tests pass.
