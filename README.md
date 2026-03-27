# Sustainable Firefighter Monitoring Device (SFMD)

An IoT-based wearable safety device that continuously monitors a firefighter's physical condition, movement, and location in real time, and presents this data on a centralized web dashboard for commanders or monitoring personnel.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Hardware Components](#3-hardware-components)
4. [Circuit Connections](#4-circuit-connections)
5. [Circuit Diagrams](#5-circuit-diagrams)
6. [How It Works](#6-how-it-works)
   - [Device States](#61-device-states)
   - [Movement Detection Logic](#62-movement-detection-logic)
   - [Temperature Monitoring Logic](#63-temperature-monitoring-logic)
   - [SOS Logic](#64-sos-logic)
   - [Local Alerts](#65-local-alerts)
   - [Data Transmission](#66-data-transmission)
7. [Web Dashboard](#7-web-dashboard)
   - [Dashboard Features](#71-dashboard-features)
   - [Dashboard Screenshot](#72-dashboard-screenshot)
8. [Technologies Used](#8-technologies-used)
9. [Project Structure](#9-project-structure)
10. [Setup & Installation](#10-setup--installation)
    - [Firmware Setup](#101-firmware-setup)
    - [Web Dashboard Setup](#102-web-dashboard-setup)
11. [API Endpoints](#11-api-endpoints)
12. [Firebase Data Schema](#12-firebase-data-schema)
13. [Communication Reliability](#13-communication-reliability)
14. [Power System](#14-power-system)
15. [Assumptions & Known Limitations](#15-assumptions--known-limitations)

---

## 1. Project Overview

The **Sustainable Firefighter Monitoring Device (SFMD)** is a real-time IoT safety solution for firefighters. A wearable device worn by the firefighter collects sensor data (motion, temperature, GPS location) and transmits it over Wi-Fi to a Firebase backend. A web dashboard hosted by fire commanders provides instant situational awareness, showing the firefighter's current status, location on a live map, environmental data, and a history of all alerts and events.

**Key capabilities:**

- Automatic emergency detection — no movement (man-down), high temperature
- Manual SOS button for immediate distress signaling
- Live GPS tracking on an interactive map
- Color-coded status indicators with voice alerts on the dashboard
- Historical data and analytics (temperature trend, movement timeline, status distribution)

---

## 2. System Architecture

```
┌─────────────────────────────────────────┐
│       Firefighter Wearable Device       │
│                                         │
│  [MPU-6050]  [DHT11]  [Neo-6M GPS]      │
│  [SOS Btn]   [Buzzer] [LED]             │
│              [ESP32]                    │
│  [Li-ion Battery]                       │
└───────────────────┬─────────────────────┘
                    │  Wi-Fi (HTTPS / JSON)
                    │  PUT to Firebase RTDB
                    ▼
┌─────────────────────────────────────────┐
│         Firebase Backend                │
│                                         │
│  Realtime Database (RTDB) — live feed   │
│  Firestore — historical readings        │
│  REST API  /api/data  (Next.js route)   │
└───────────────────┬─────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│         Web Dashboard (Next.js)         │
│                                         │
│  Live Status Panel                      │
│  Sensor Cards (Temp / Motion)           │
│  Interactive GPS Map                    │
│  Analytics (Charts, Trends)             │
│  Alert & Event Log                      │
└─────────────────────────────────────────┘
```

---

## 3. Hardware Components

| # | Component | Purpose |
|---|-----------|---------|
| 1 | **ESP32** | Main microcontroller — Wi-Fi, I2C, UART, GPIO |
| 2 | **MPU-6050** | 3-axis accelerometer & gyroscope — movement and fall detection |
| 3 | **DHT11** | Ambient temperature sensor |
| 4 | **Neo-6M GPS Module** | Latitude/longitude tracking |
| 5 | **Push Button (Momentary)** | External push button used as manual SOS trigger (two-GPIO wiring: input on GPIO14, simulated GND on GPIO27) |
| 6 | **Buzzer** | Local audible alert |
| 7 | **Battery** |power source |

---

## 4. Circuit Connections

### ESP32 Pin Map

| ESP32 Pin | Connected To | Notes |
|-----------|-------------|-------|
| **GPIO 21** (SDA) | MPU-6050 SDA | I2C data line |
| **GPIO 22** (SCL) | MPU-6050 SCL | I2C clock line |
| **3.3 V** | MPU-6050 VCC | Power |
| **GND** | MPU-6050 GND | Ground |
| **GPIO 4** | DHT11 Data | Single-wire protocol; 10 kΩ pull-up to 3.3 V |
| **3.3 V** | DHT11 VCC | Power |
| **GND** | DHT11 GND | Ground |
| **GPIO 16** (RX1) | Neo-6M GPS TX | Hardware Serial 1 RX |
| **GPIO 17** (TX1) | Neo-6M GPS RX | Hardware Serial 1 TX |
| **3.3 V** | Neo-6M VCC | Power (some modules need 5 V — check datasheet) |
| **GND** | Neo-6M GND | Ground |
| **GPIO 14** | SOS Push Button (signal pin) | Active LOW; internal pull-up (`INPUT_PULLUP`) enabled |
| **GPIO 27** | SOS Push Button (GND pin) | Driven permanently LOW — acts as the button's ground leg (no physical GND wire needed) |
| **GPIO 13** | Buzzer (+) | Active HIGH |
| **3.3 V / 5 V** | RGB LED VCC | Via suitable current-limiting resistors |
| **GND** | RGB LED GND | Ground |
| **Battery +** | ESP32 VIN (or 5 V rail) | Power input to ESP32 |
| **Battery −** | ESP32 GND | Ground |

> **Note:** The MPU-6050 operates at I2C address `0x68`. If the AD0 pin is pulled HIGH, the address becomes `0x69`.

### Wiring Diagram (Textual)

```
              Battery (+) ──► ESP32 VIN
              Battery (−) ──► ESP32 GND

 ESP32 3.3V ──► MPU-6050 VCC
 ESP32 GND  ──► MPU-6050 GND
 ESP32 G21  ──► MPU-6050 SDA
 ESP32 G22  ──► MPU-6050 SCL

 ESP32 3.3V ──► 10kΩ ──► DHT11 Pin 2 (Data) ──► ESP32 G4
 ESP32 3.3V ──► DHT11 Pin 1 (VCC)
 ESP32 GND  ──► DHT11 Pin 4 (GND)

 ESP32 G16 (RX) ──► Neo-6M TX
 ESP32 G17 (TX) ──► Neo-6M RX
 ESP32 3.3V     ──► Neo-6M VCC
 ESP32 GND      ──► Neo-6M GND

 ESP32 G14 ──► Push Button ──► ESP32 G27  (G27 held LOW = simulated GND, INPUT_PULLUP on G14)

 ESP32 G13 ──► Buzzer (+)
 ESP32 GND  ──► Buzzer (−)
```

---

## 5. Circuit Diagrams

The repository includes the visual circuit diagram for the **ESP32**:

![SFMD circuit](SFMD%20circuit.jpeg)

---

## 6. How It Works

### 6.1 Device States

The firmware operates as a state machine with the following states:

| State | Condition | Buzzer Behavior |
|-------|-----------|----------------------|
| **STARTUP** | Device initializing | — |
| **NORMAL** | All parameters within safe limits | buzzer off |
| **WARNING** | Potential danger detected | buzzer intermittent (1 Hz) |
| **EMERGENCY** | Critical condition detected | buzzer continuous |
| **SOS** | Manual SOS button pressed | buzzer continuous; overrides all other states |

### 6.2 Movement Detection Logic

The MPU-6050 provides raw 16-bit accelerometer data on the X, Y, Z axes. The firmware:

1. Reads raw values every loop iteration.
2. Converts to gravitational units: `Ax = AccX / 16384.0` (±2 g range).
3. Calculates total acceleration magnitude: `totalAcc = √(Ax² + Ay² + Az²)`.
4. Computes deviation from resting gravity: `movement = |totalAcc − 1.0|`.
5. If `movement < 0.03 g` (below the micro-motion threshold), a no-movement timer starts.

| Duration of No Movement | State Assigned |
|-------------------------|---------------|
| < 10 seconds | MOVING (normal) |
| 10 – 29 seconds | WARNING |
| ≥ 30 seconds | EMERGENCY |

> The threshold of `0.13 g` filters out sensor noise while still catching genuine stillness. Values below this deviation from 1 g are treated as "no movement".

### 6.3 Temperature Monitoring Logic

The DHT11 reads ambient temperature each loop cycle.

| Temperature | State Assigned |
|-------------|---------------|
| < 25 °C | NORMAL — buzzer silent |
| 25 – 30 °C | NORMAL — 1 ambient beep/min (awareness) |
| 30 – 35 °C | NORMAL — 2 ambient beeps/min (awareness) |
| 35 – 40 °C | NORMAL — 3 ambient beeps/min (awareness) |
| > 40 °C | Escalates to at least **WARNING** (inactivity timers may push to EMERGENCY) |

If `dht.readTemperature()` returns `NaN`, `dhtStatus` is set to `"ERROR"` and `systemStatus` to `"SENSOR_FAILURE"`.

### 6.4 SOS Logic

- An external push button is used as the SOS trigger, wired across **two GPIO pins**:
  - **GPIO 14** — signal input, configured as `INPUT_PULLUP` (active LOW).
  - **GPIO 27** — driven `LOW` permanently in firmware, acting as the button's ground leg. This avoids routing a wire to a physical GND pin on the ESP32 and simplifies the wiring harness.
- When the button is pressed, GPIO 14 reads `LOW` (pulled to GPIO 27's forced LOW).
- Each press **toggles** the SOS state: first press activates SOS, second press deactivates it (debounced at 200 ms).
- While active, SOS overrides all other states and sets `deviceState = "SOS"`.


### 6.5 Data Transmission

Every loop iteration (no blocking delay), the firmware calls `sendToFirebase()` which:

1. Checks `WiFi.status() == WL_CONNECTED`.
2. Opens a secure HTTPS connection (`WiFiClientSecure`, certificate verification disabled for prototype).
3. Sends an HTTP **PUT** request to:
   ```
   https://<FIREBASE_URL>.firebaseio.com/firefighters/FF_001.json?auth=<SECRET>
   ```
4. Payload is a JSON object:

```json
{
  "temperature": 42.5,
  "total_acc": 0.98,
  "movement": "MOVING",
  "status": "NORMAL",
  "mpu_status": "OK",
  "dht_status": "OK",
  "gps_status": "OK",
  "system_status": "OK",
  "latitude": 17.385044,
  "longitude": 78.486671,
  "timestamp": 154823
}
```

> `timestamp` is the ESP32's uptime in milliseconds (`millis()`). The dashboard uses the server's local time as the human-readable timestamp.

If Wi-Fi is unavailable, the device continues local alerts (buzzer/LED) but skips the transmission, ensuring the firefighter is still warned locally.

---

## 7. Web Dashboard

### 7.1 Dashboard Features

The web dashboard is a Next.js application that connects to Firebase Realtime Database and displays live data. It is organized into three panels:

#### Left Panel — Status & Logs
| Widget | Description |
|--------|-------------|
| **Status Card** | Large color-coded card showing current device state (NORMAL / WARNING / EMERGENCY / SOS / OFFLINE). Animates for EMERGENCY and SOS. |
| **Battery Card** | Shows battery percentage with a progress bar. Warns when below 20 %. |
| **Sensor Row** | Temperature (°C) and Motion (Moving / Still) at a glance. |
| **Comm Reliability** | Signal strength, packet loss, and latency bars. |
| **Live Logs** | Scrollable, timestamped alert log. New events slide in with animation. |

#### Center Panel — Map & Field Units
| Widget | Description |
|--------|-------------|
| **Live GPS Map** | Interactive MapLibre GL map showing real-time firefighter position with a trail of last 50 GPS points. |
| **Field Units Roster** | Grid of all registered units (FF_001 – FF_004) with online/offline indicators. |

#### Right Panel — Analytics
| Widget | Description |
|--------|-------------|
| **Temperature Stats** | Min / Avg / Max temperature badges computed from rolling 60-reading window. |
| **Temperature Trend Chart** | Line chart of the last 60 temperature readings over time (Recharts). |
| **Movement Timeline** | Pixel strip showing moving (blue) vs. still (grey) for last 60 readings, with an active-percentage bar. |
| **Status Distribution** | Donut chart and legend showing % breakdown of Normal / Warning / Emergency / SOS states. |

#### Header
- System name **SFMD Command Center**
- Signal quality pill and battery pill
- Live / Offline indicator with Device ID
- **Run Simulation** button — toggles a built-in mock data generator for demonstrations without real hardware

### 7.2 Dashboard Screenshot

| Real Data in Action |
|---|
| ![Dashboard with real data](Real%20data%20output.png) |

---

## 8. Technologies Used

### Firmware (Hardware)
| Technology | Role |
|------------|------|
| **ESP32** | Dual-core 240 MHz MCU with Wi-Fi & Bluetooth |
| **Arduino Framework (C++)** | Firmware programming language |
| **Wire.h** | I2C communication with MPU-6050 |
| **DHT.h** | DHT11 sensor driver |
| **TinyGPS++** | NMEA sentence parsing for Neo-6M GPS |
| **WiFi.h** | ESP32 Wi-Fi connection management |
| **HTTPClient / WiFiClientSecure** | Secure HTTPS data transmission to Firebase |

### Backend / Database
| Technology | Role |
|------------|------|
| **Firebase Realtime Database (RTDB)** | Receives live PUT data from ESP32; streams to dashboard |
| **Firebase Firestore** | Stores historical sensor readings via the Next.js API route |
| **Firebase Admin SDK** | Server-side Firestore writes from the API route |

### Web Dashboard (Frontend)
| Technology | Role |
|------------|------|
| **Next.js 16** | React framework with App Router, SSR/SSG, and API routes |
| **React 19** | UI component library |
| **TypeScript** | Type-safe JavaScript |
| **Tailwind CSS v4** | Utility-first styling |
| **Framer Motion** | Animations and transitions |
| **MapLibre GL** | 3D interactive mapping |
| **React-Leaflet / Leaflet** | Alternative map layer |
| **Recharts** | Line chart, pie/donut chart for analytics |
| **Lucide React** | Icon library |
| **Firebase JS SDK** | RTDB real-time listener (`onValue`) on the client |
| **date-fns** | Date formatting utilities |
| **clsx / tailwind-merge** | Conditional and merged Tailwind class utilities |

---

## 9. Project Structure

```
firefighter-monitoring-device/
├── firmware/
│   └── used code.ino            # ESP32 Arduino firmware
├── web-dashboard/               # Next.js web application
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx         # Main dashboard page
│   │   │   ├── layout.tsx       # Root HTML layout + metadata
│   │   │   ├── globals.css      # Global styles
│   │   │   └── api/
│   │   │       └── data/
│   │   │           └── route.ts # POST /api/data — receives ESP32 data
│   │   ├── components/
│   │   │   ├── AnalyticsPanel.tsx  # Charts and analytics
│   │   │   ├── MapWrapper.tsx      # Dynamic map loader (SSR-safe)
│   │   │   ├── MapLibreMap.tsx     # MapLibre GL 3D map component
│   │   │   └── Map.tsx             # Leaflet map component
│   │   └── lib/
│   │       ├── firebase.ts         # Firebase client SDK init (RTDB + Firestore)
│   │       └── firebaseAdmin.ts    # Firebase Admin SDK init (Firestore writes)
│   ├── public/                  # Static assets
│   ├── package.json
│   ├── next.config.ts
│   └── tsconfig.json
├── SFMD with ESP 32.png         # Circuit diagram
├── Real data output.png         # Screenshot of dashboard with real data
├── list of components.txt       # Hardware BOM
└── PRD.txt                      # Product Requirements Document
```

---

## 10. Setup & Installation

### 10.1 Firmware Setup

#### Prerequisites
- [Arduino IDE](https://www.arduino.cc/en/software) (or PlatformIO)
- ESP32 board package installed in Arduino IDE
- The following libraries installed via Library Manager:
  - `DHT sensor library` by Adafruit
  - `TinyGPS++` by Mikal Hart

#### Steps

1. Open `firmware/used code.ino` in Arduino IDE.
2. Replace the placeholder credentials:
   ```cpp
   const char* ssid     = "YOUR_WIFI_NAME";
   const char* password = "YOUR_WIFI_PASSWORD";

   String firebaseHost = "https://YOUR_FIREBASE_URL.firebaseio.com";
   String firebaseAuth = "YOUR_FIREBASE_SECRET";
   ```
3. Select **ESP32 Dev Module** (or your specific ESP32 board) under **Tools → Board**.
4. Connect the ESP32 via USB and select the correct **Port**.
5. Click **Upload**.
6. Open the **Serial Monitor** at **115200 baud** to see live diagnostic output.

#### Expected Serial Output
```
Connecting to WiFi....
WiFi Connected
SFMD System Started

==== FIREFIGHTER REPORT ====
State: NORMAL
Movement: MOVING
Temperature: 31.00
MPU Status: OK
DHT Status: OK
GPS Status: NO_SIGNAL
System Status: OK
============================
Firebase Response: 200
```

### 10.2 Web Dashboard Setup

#### Prerequisites
- Node.js ≥ 18
- A Firebase project with:
  - Realtime Database enabled
  - Firestore enabled
  - A service account key (for Admin SDK)

#### Steps

1. Navigate to the dashboard folder:
   ```bash
   cd web-dashboard
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file in `web-dashboard/` with your Firebase configuration:
   ```env
   # Firebase Client SDK (public — safe to expose)
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your_project-default-rtdb.firebaseio.com

   # Firebase Admin SDK (server-only — never expose publicly)
   FIREBASE_PROJECT_ID=your_project_id
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your_project.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

4.To build for production:
   ```bash
   npm run build
   npm start
   ```

5.  Run the development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Demo mode:** Without any Firebase configuration or hardware, click the **Run Simulation** button on the dashboard header to see a fully-functional mock data feed with random state changes, GPS movement, and alerts.

---

## 11. API Endpoints

The Next.js server exposes the following REST API route:

### `POST /api/data`

Receives sensor data from the ESP32 (or any HTTP client) and stores it in Firestore.

**Request Body (JSON):**
```json
{
  "device_id": "FF_001",
  "temperature": 42.5,
  "movement": "MOVING",
  "status": "NORMAL",
  "latitude": 17.385044,
  "longitude": 78.486671
}
```

**Success Response (`200 OK`):**
```json
{ "success": true }
```

**Error Responses:**

| Code | Reason |
|------|--------|
| `400` | `device_id` missing from request body |
| `503` | Firebase Admin not initialized (missing env vars) |
| `500` | Internal server error |

> **Note:** The primary real-time data path uses the ESP32 → Firebase RTDB direct PUT. The `/api/data` endpoint is provided for alternative HTTP-based ingestion and for writing to the Firestore historical collection.

---

## 12. Firebase Data Schema

### Realtime Database (live state — written by ESP32)
```
/firefighters/FF_001
  ├── temperature      : number    (°C)
  ├── total_acc        : number    (g)
  ├── movement         : string    ("MOVING" | "NOT MOVING (N sec)" | "NOT MOVING LONG TIME (N sec)")
  ├── status           : string    ("NORMAL" | "WARNING" | "EMERGENCY" | "EMERGENCY (HIGH TEMP)" | "SOS")
  ├── mpu_status       : string    ("OK" | "ERROR")
  ├── dht_status       : string    ("OK" | "ERROR")
  ├── gps_status       : string    ("OK" | "NO_SIGNAL")
  ├── system_status    : string    ("OK" | "SENSOR_FAILURE")
  ├── latitude         : number
  ├── longitude        : number
  └── timestamp        : number    (ESP32 millis uptime)
```

### Firestore (historical readings — written by /api/data)
```
Collection: readings
  Document (auto-ID):
    ├── device_id   : string
    ├── temperature : number
    ├── movement    : string
    ├── status      : string
    ├── location    : { lat: number, lng: number }
    └── timestamp   : Timestamp (server-generated)

Collection: devices
  Document: FF_001 (device_id)
    ├── device_id   : string
    ├── temperature : number
    ├── movement    : string
    ├── status      : string
    ├── location    : { lat: number, lng: number }
    └── lastSeen    : Timestamp (server-generated)
```

---

## 13. Communication Reliability

Wi-Fi alone may be unreliable in fire zones due to structural interference and signal attenuation.

| Technology | Status | Range | Notes |
|------------|--------|-------|-------|
| **Wi-Fi** | ✅ Implemented | ~50–100 m indoors | Primary data channel to Firebase |
| **Bluetooth** | 🔧 Available | ~10–30 m | ESP32 has built-in BT; can relay to a nearby commander's device |
| **LoRa** | 🔮 Future upgrade | up to several km | Ideal for outdoor or large-scale deployments |
| **GSM / LTE** | 🔮 Future upgrade | Nationwide | Cellular backup for areas without Wi-Fi |

The device continues local alerts (buzzer + LED) even when the Wi-Fi connection is lost, ensuring the firefighter is always warned regardless of connectivity.

---

## 14. Power System

| Component | Role |
|-----------|------|
| **Li-ion Battery** | Primary power source, provides continuous power |
| **ESP32** | Powered directly from the battery (3.7 V–4.2 V battery → 3.3 V ESP32 via onboard LDO) |

The Li-ion battery is the sole power source for the device during operations, ensuring reliable and continuous functionality.

---

## 15. Assumptions & Known Limitations

| Item | Detail |
|------|--------|
| **GPS accuracy indoors** | The Neo-6M GPS signal degrades or is unavailable inside buildings. The dashboard retains the last known location. |
| **DHT11 accuracy** | ±2 °C accuracy; suitable for prototype validation. Production devices should use a more accurate sensor (e.g., DHT22 or SHT31). |
| **Single firefighter** | The current firmware is hardcoded for device ID `FF_001`. Multi-device support is planned for a future version. |
| **Firebase secret auth** | The firmware uses a legacy Firebase Database Secret for authentication. This should be replaced with Firebase Authentication tokens in production. |
| **SSL certificate verification** | `client.setInsecure()` disables certificate verification in the firmware for simplicity. A production device should verify the server certificate. |
| **No blocking delay** | The main `loop()` has no `delay()` to ensure continuous GPS parsing and sensor reads. |
| **Uptime timestamp** | The ESP32 sends `millis()` (uptime in ms) as the timestamp, not wall-clock time. The dashboard uses the server's local time for human-readable timestamps. |
