/*
 * ============================================================
 *  ALL SENSORS Serial Monitor Test
 *  SFMD (Smart Firefighter Monitoring Device) — ESP32
 * ============================================================
 *
 * SENSORS TESTED IN THIS SKETCH:
 *  1. GPS  — GY-NEO6MV2     (TinyGPS++ library)
 *  2. IMU  — MPU6050         (Adafruit MPU6050 library)
 *  3. ENV  — DHT11           (DHT sensor library)
 *  4. SOS  — Push Button     (Digital INPUT_PULLUP)
 *  5. OUT  — Buzzer          (Beeps on startup to confirm)
 *
 * ── WIRING TABLE ────────────────────────────────────────────
 *
 *  GPS (GY-NEO6MV2):
 *    VCC  → 3.3V
 *    GND  → GND
 *    TX   → GPIO16  (ESP32 RX2)       ← GPS sends data here
 *    RX   → GPIO17  (ESP32 TX2)       → ESP32 sends config
 *
 *  ⚠️  DO NOT use GPIO1/GPIO3 (RX0/TX0) for GPS — those are
 *      the USB Serial pins and will break the Serial Monitor.
 *
 *  MPU6050 (I2C):
 *    VCC  → 3.3V
 *    GND  → GND
 *    SDA  → GPIO21  (ESP32 default SDA)
 *    SCL  → GPIO22  (ESP32 default SCL)
 *
 *  DHT11:
 *    VCC  → 3.3V or 5V
 *    GND  → GND
 *    DATA → GPIO4
 *
 *  SOS Button:
 *    One leg → GPIO15
 *    Other   → GND   (uses INPUT_PULLUP)
 *
 *  Buzzer:
 *    Positive → GPIO18
 *    Negative → GND
 *
 * ── LIBRARIES REQUIRED ──────────────────────────────────────
 *  • TinyGPS++         by Mikal Hart
 *  • Adafruit MPU6050  by Adafruit
 *  • Adafruit Unified Sensor by Adafruit
 *  • DHT sensor library by Adafruit
 *  Install all via: Arduino IDE → Tools → Manage Libraries
 *
 * ── SERIAL MONITOR ──────────────────────────────────────────
 *  Open at: 115200 baud
 * ============================================================
 */

#include <TinyGPS++.h>
#include <HardwareSerial.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <DHT.h>
#include <Wire.h>
#include <math.h>

// ── Pin Definitions ──────────────────────────────────────────
#define GPS_RX_PIN    16   // ESP32 RX2 ← GPS TX
#define GPS_TX_PIN    17   // ESP32 TX2 → GPS RX
#define GPS_BAUD      9600

#define DHTPIN        4
#define DHTTYPE       DHT11

#define SOS_BUTTON    15   // Active LOW (INPUT_PULLUP)
#define BUZZER_PIN    18

// ── Objects ──────────────────────────────────────────────────
HardwareSerial  gpsSerial(2);
TinyGPSPlus     gps;
Adafruit_MPU6050 mpu;
DHT             dht(DHTPIN, DHTTYPE);

// ── State ─────────────────────────────────────────────────────
unsigned long lastPrint    = 0;
const unsigned long PRINT_INTERVAL = 2000; // ms between reports
unsigned long gpsCharsReceived = 0;

bool mpuOK  = false;
bool dhtOK  = false;
bool gpsOK  = false;

// ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);

  // ── Buzzer: startup beep to confirm power ──────────────────
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(150);
  digitalWrite(BUZZER_PIN, LOW);
  delay(100);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(150);
  digitalWrite(BUZZER_PIN, LOW);

  // ── SOS Button ────────────────────────────────────────────
  pinMode(SOS_BUTTON, INPUT_PULLUP);

  // ── Print header ──────────────────────────────────────────
  Serial.println();
  Serial.println(F("╔══════════════════════════════════════════════╗"));
  Serial.println(F("║   SFMD — All Sensors Test  (ESP32)           ║"));
  Serial.println(F("║   Serial Monitor @ 115200 baud               ║"));
  Serial.println(F("╚══════════════════════════════════════════════╝"));

  // ── GPS (Serial2) ─────────────────────────────────────────
  Serial.print(F("\n[GPS]  Initializing on GPIO16(RX)/17(TX)... "));
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println(F("DONE (waiting for satellite fix)"));

  // ── MPU6050 (I2C) ─────────────────────────────────────────
  Wire.begin();
  Serial.print(F("[IMU]  Initializing MPU6050 on I2C (SDA=21, SCL=22)... "));
  if (mpu.begin()) {
    mpuOK = true;
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    Serial.println(F("OK ✓"));
  } else {
    Serial.println(F("FAILED ✗  — Check SDA/SCL wiring or I2C address"));
  }

  // ── DHT11 ─────────────────────────────────────────────────
  Serial.print(F("[ENV]  Initializing DHT11 on GPIO4... "));
  dht.begin();
  delay(2000); // DHT11 needs 2s after power-on before first read
  float testTemp = dht.readTemperature();
  if (!isnan(testTemp)) {
    dhtOK = true;
    Serial.println(F("OK ✓"));
  } else {
    // DHT can be slow, mark OK tentatively and retry in loop
    dhtOK = false;
    Serial.println(F("No response yet — will retry in loop"));
  }

  Serial.println(F("\n[SOS]  Button on GPIO15 (active LOW) — READY"));
  Serial.println(F("[BUZ]  Buzzer on GPIO18 — startup beep done"));

  Serial.println(F("\n──────────────────────────────────────────────────"));
  Serial.println(F("  Reporting every 2 seconds. GPS fix may take"));
  Serial.println(F("  30s – 3min outdoors. Use near a window."));
  Serial.println(F("──────────────────────────────────────────────────\n"));
}

// ─────────────────────────────────────────────────────────────
void loop() {
  // Feed GPS bytes into parser
  while (gpsSerial.available() > 0) {
    char c = gpsSerial.read();
    gps.encode(c);
    gpsCharsReceived++;
  }

  // Print full report at interval
  if (millis() - lastPrint >= PRINT_INTERVAL) {
    lastPrint = millis();
    printAllSensors();
  }
}

// ─────────────────────────────────────────────────────────────
void printAllSensors() {
  Serial.println(F("\n══════════════════════════════════════════════════"));
  Serial.print(F("  Uptime: "));
  printUptime();
  Serial.println(F("══════════════════════════════════════════════════"));

  printGPS();
  printIMU();
  printEnv();
  printSOS();
}

// ── GPS ──────────────────────────────────────────────────────
void printGPS() {
  Serial.println(F("\n  ┌─── GPS (GY-NEO6MV2) ──────────────────────┐"));

  Serial.print(F("  │  Chars received  : "));
  Serial.println(gpsCharsReceived);

  Serial.print(F("  │  Sentences OK    : "));
  Serial.println(gps.passedChecksum());

  Serial.print(F("  │  Sentences FAIL  : "));
  Serial.println(gps.failedChecksum());

  // Location
  Serial.print(F("  │  Latitude        : "));
  if (gps.location.isValid()) {
    Serial.println(gps.location.lat(), 6);
  } else {
    Serial.println(F("-- No fix yet --"));
  }

  Serial.print(F("  │  Longitude       : "));
  if (gps.location.isValid()) {
    Serial.println(gps.location.lng(), 6);
  } else {
    Serial.println(F("-- No fix yet --"));
  }

  // Altitude
  Serial.print(F("  │  Altitude        : "));
  if (gps.altitude.isValid()) {
    Serial.print(gps.altitude.meters(), 1);
    Serial.println(F(" m"));
  } else {
    Serial.println(F("INVALID"));
  }

  // Speed
  Serial.print(F("  │  Speed           : "));
  if (gps.speed.isValid()) {
    Serial.print(gps.speed.kmph(), 2);
    Serial.println(F(" km/h"));
  } else {
    Serial.println(F("INVALID"));
  }

  // Satellites
  Serial.print(F("  │  Satellites      : "));
  if (gps.satellites.isValid()) {
    Serial.println(gps.satellites.value());
  } else {
    Serial.println(F("INVALID"));
  }

  // HDOP — lower = more accurate (< 2 is good)
  Serial.print(F("  │  HDOP (accuracy) : "));
  if (gps.hdop.isValid()) {
    float h = gps.hdop.hdop();
    Serial.print(h, 2);
    if      (h < 1.0) Serial.println(F("  ← Excellent"));
    else if (h < 2.0) Serial.println(F("  ← Good"));
    else if (h < 5.0) Serial.println(F("  ← Moderate"));
    else               Serial.println(F("  ← Poor"));
  } else {
    Serial.println(F("INVALID"));
  }

  // Date & Time
  Serial.print(F("  │  Date/Time (UTC) : "));
  if (gps.date.isValid() && gps.time.isValid()) {
    char buf[30];
    snprintf(buf, sizeof(buf), "%04d-%02d-%02d  %02d:%02d:%02d",
             gps.date.year(), gps.date.month(), gps.date.day(),
             gps.time.hour(),  gps.time.minute(), gps.time.second());
    Serial.println(buf);
  } else {
    Serial.println(F("INVALID"));
  }

  // Course
  Serial.print(F("  │  Course/Heading  : "));
  if (gps.course.isValid()) {
    Serial.print(gps.course.deg(), 1);
    Serial.println(F(" deg"));
  } else {
    Serial.println(F("INVALID"));
  }

  // Warning if no bytes from GPS at all
  if (gpsCharsReceived == 0) {
    Serial.println(F("  │"));
    Serial.println(F("  │  ⚠ ZERO bytes from GPS — check wiring!"));
    Serial.println(F("  │    GPS TX → GPIO16 | GPS VCC → 3.3V"));
  }

  Serial.println(F("  └────────────────────────────────────────────┘"));
}

// ── MPU6050 ──────────────────────────────────────────────────
void printIMU() {
  Serial.println(F("\n  ┌─── IMU (MPU6050) ─────────────────────────┐"));

  if (!mpuOK) {
    Serial.println(F("  │  STATUS : SENSOR NOT FOUND"));
    Serial.println(F("  │  Check SDA→GPIO21, SCL→GPIO22, VCC→3.3V"));
    Serial.println(F("  └────────────────────────────────────────────┘"));
    return;
  }

  sensors_event_t acc, gyro, temp_mpu;
  mpu.getEvent(&acc, &gyro, &temp_mpu);

  // Accelerometer
  Serial.println(F("  │  [Accelerometer] (m/s²)"));
  Serial.print(F("  │    X: "));  Serial.print(acc.acceleration.x, 3);
  Serial.print(F("   Y: "));      Serial.print(acc.acceleration.y, 3);
  Serial.print(F("   Z: "));      Serial.println(acc.acceleration.z, 3);

  // Total acceleration magnitude
  float accelMag = sqrt(
    pow(acc.acceleration.x, 2) +
    pow(acc.acceleration.y, 2) +
    pow(acc.acceleration.z, 2)
  );
  Serial.print(F("  │    Magnitude: "));
  Serial.print(accelMag, 3);
  Serial.print(F(" m/s²   Movement: "));
  float deviation = abs(accelMag - 9.81);
  if      (deviation < 0.5)  Serial.println(F("STILL"));
  else if (deviation < 2.0)  Serial.println(F("SLIGHT MOTION"));
  else                       Serial.println(F("ACTIVE MOTION ⚡"));

  // Gyroscope
  Serial.println(F("  │  [Gyroscope] (rad/s)"));
  Serial.print(F("  │    X: "));  Serial.print(gyro.gyro.x, 4);
  Serial.print(F("   Y: "));      Serial.print(gyro.gyro.y, 4);
  Serial.print(F("   Z: "));      Serial.println(gyro.gyro.z, 4);

  // MPU internal temperature
  Serial.print(F("  │  [Chip Temp]: "));
  Serial.print(temp_mpu.temperature, 1);
  Serial.println(F(" °C  (MPU6050 internal — not ambient)"));

  // Fall / tilt detection
  Serial.print(F("  │  [Tilt/Fall] : "));
  float ax = acc.acceleration.x;
  float ay = acc.acceleration.y;
  float az = acc.acceleration.z;
  float tiltAngle = atan2(sqrt(ax*ax + ay*ay), az) * 180.0 / PI;
  Serial.print(tiltAngle, 1);
  Serial.print(F("°  "));
  if (tiltAngle > 60.0) Serial.println(F("← POSSIBLE FALL ⚠"));
  else                  Serial.println(F("← Upright"));

  Serial.println(F("  └────────────────────────────────────────────┘"));
}

// ── DHT11 ────────────────────────────────────────────────────
void printEnv() {
  Serial.println(F("\n  ┌─── ENV Sensor (DHT11) ────────────────────┐"));

  float temperature = dht.readTemperature();   // Celsius
  float humidity    = dht.readHumidity();

  if (isnan(temperature) || isnan(humidity)) {
    dhtOK = false;
    Serial.println(F("  │  STATUS : READ FAILED"));
    Serial.println(F("  │  Check DATA→GPIO4, VCC→3.3V/5V, GND→GND"));
    Serial.println(F("  │  (DHT11 needs 2s between readings)"));
  } else {
    dhtOK = true;
    float heatIndex = dht.computeHeatIndex(temperature, humidity, false);

    Serial.print(F("  │  Temperature : "));
    Serial.print(temperature, 1);
    Serial.print(F(" °C   "));
    // Alert thresholds
    if      (temperature > 50.0) Serial.println(F("⚠⚠  CRITICAL — DANGER ZONE"));
    else if (temperature > 40.0) Serial.println(F("⚠   HIGH — WARNING"));
    else if (temperature > 35.0) Serial.println(F("⚡  ELEVATED"));
    else                          Serial.println(F("✓   Normal"));

    Serial.print(F("  │  Humidity    : "));
    Serial.print(humidity, 1);
    Serial.println(F(" %RH"));

    Serial.print(F("  │  Heat Index  : "));
    Serial.print(heatIndex, 1);
    Serial.println(F(" °C  (perceived temperature)"));
  }

  Serial.println(F("  └────────────────────────────────────────────┘"));
}

// ── SOS Button ───────────────────────────────────────────────
void printSOS() {
  Serial.println(F("\n  ┌─── SOS Button & Alerts ───────────────────┐"));

  bool sosPressed = (digitalRead(SOS_BUTTON) == LOW);

  Serial.print(F("  │  SOS Button (GPIO15) : "));
  if (sosPressed) {
    Serial.println(F("PRESSED ⚠  SOS ACTIVE!"));
    // Beep to acknowledge button detection
    digitalWrite(BUZZER_PIN, HIGH);
    delay(100);
    digitalWrite(BUZZER_PIN, LOW);
  } else {
    Serial.println(F("Not pressed  ✓"));
  }

  Serial.println(F("  │  Buzzer (GPIO18)     : Beeps on SOS / startup"));
  Serial.println(F("  └────────────────────────────────────────────┘"));
}

// ── Helper: print readable uptime ────────────────────────────
void printUptime() {
  unsigned long s = millis() / 1000;
  unsigned long m = s / 60;
  unsigned long h = m / 60;
  s %= 60; m %= 60;
  char buf[20];
  snprintf(buf, sizeof(buf), "%02lu:%02lu:%02lu", h, m, s);
  Serial.println(buf);
}
