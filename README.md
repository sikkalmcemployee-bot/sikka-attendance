# Sikka HRMS Attendance

Enterprise Attendance & HRMS system for Sikka Industries & Logistics.

---

## 🚀 Features

- **Instant Mark IN & Mark OUT**: High-performance warm GPS location detection with zero UI delay.
- **Geofence & Plant Verification**: High-precision boundary matching for designated plant facilities.
- **Employee & Shift Management**: Full session and day/night shift management.
- **Approvals & Leave Workflows**: Clean administrative approvals for employee records and leave requests.
- **Realtime Sync**: Low-latency updates powered by Server-Sent Events (SSE) and fast MongoDB indexing.

---

## ⚙️ Environment Variables

Create `.env.local` with:

```env
# MongoDB
MONGODB_URI=mongodb+srv://...
MONGODB_DB=sikka_database

# ArcGIS (Optional for reverse geocoding fallback)
ARCGIS_API_KEY=your_key
```

---

## 💻 Development

```bash
npm install
npm run dev
```

To build for production:

```bash
npm run build
npm run start
```
