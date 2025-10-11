This is a minimal Flutter web frontend for the A6 Cars project.

Prerequisites
- Install Flutter SDK: https://flutter.dev/docs/get-started/install
- Ensure you can run Flutter web: `flutter channel stable && flutter upgrade && flutter config --enable-web`

Run locally (web):

1. From this workspace root:

```bash
cd flutter_app
flutter pub get
flutter run -d chrome
```

This will start a Flutter development server and open a browser. The demo app is minimal and
uses static/demo data. To connect to the existing Node backend:

- Update the HTTP calls (not implemented in the demo) to point to `http://localhost:3000/api/...`.
- If running the Node server and Flutter web on the same machine, you might need to enable CORS on the server (already enabled in the Node app).

Enhancements I can make
- Implement full API integration (login/register, fetch cars, fetch bookings, book car).
- Add calendar widgets and date-blocking logic in the Flutter UI.
- Add persistent storage for auth tokens/local storage.

Let me know which features you want next and I will implement them.
