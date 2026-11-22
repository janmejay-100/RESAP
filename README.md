# RESAP — Resize. Prepare. Apply.

RESAP is a modern, lightweight, and powerful online document utility platform designed to help you process documents and images quickly and securely.

## 🚀 Features

- **Image Compression**: Reduce file size while maintaining quality.
- **Scan & Upload**: Seamlessly transfer files from your mobile device to your laptop using QR codes.
- **PDF Tools**: (Coming Soon) Merge, split, and compress PDF files.
- **Privacy First**: All processing happens locally or in temporary secure sessions. Files are automatically deleted after processing or session expiry.
- **Cross-Platform**: Works on any modern web browser.

## 🛠️ Tech Stack

- **Frontend**: Vite, Vanilla JS, CSS3, Lucide Icons
- **Backend**: Node.js, Express, Socket.IO
- **Utilities**: Multer (file uploads), Canvas API (image processing), QRCode.js

## 📦 Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/RESAP.git
   cd RESAP
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Setup**:
   Create a `.env` file in the root directory (optional, defaults are provided):
   ```env
   PORT=3001
   FRONTEND_ORIGIN=http://localhost:3000
   SESSION_TTL_SECONDS=300
   MAX_FILE_SIZE_BYTES=52428800
   ```

## 🚀 Running the App

### Development Mode
Start both frontend and backend in development mode:
```bash
# Terminal 1: Backend
node server/index.js

# Terminal 2: Frontend
npm run dev
```

### Production Build
Build the frontend for production:
```bash
npm run build
```

## 🔒 Security & Privacy

- **Temporary Sessions**: Scan & Upload sessions are protected by unique IDs and tokens.
- **Automatic Cleanup**: Temporary files and sessions are purged every 10 seconds after they expire.
- **No Long-term Storage**: RESAP does not store your documents permanently.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.

---
Built with ❤️ by Jnamejay Sahoo
