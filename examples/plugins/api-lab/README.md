# API Lab

Static DevLauncher WebView plugin for lightweight API requests.

Features:

- Edit method, URL, query, headers, and body.
- Send requests with browser `fetch`.
- View status, time, response headers, and formatted response body.
- Save environments, collections, and recent history locally.
- Import and export API Lab JSON backups.

First version limitation:

- Requests run through browser `fetch`, so some APIs may fail because of CORS.
- Native proxy, certificate, cookie jar, multipart upload, and binary response support are planned for a later DevLauncher native HTTP capability.
