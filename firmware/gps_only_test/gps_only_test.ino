/*
 * ============================================================
 *  GPS ONLY TEST — ESP32 + NEO-6M
 * ============================================================
 *
 *  WIRING:
 *  ┌──────────────┬─────────────────────────┐
 *  │  NEO-6M Pin  │  ESP32 Pin              │
 *  ├──────────────┼─────────────────────────┤
 *  │  VCC         │  3.3V                   │
 *  │  GND         │  GND                    │
 *  │  TX  (GPS)   │  GPIO16  (ESP32 RX2)    │
 *  │  RX  (GPS)   │  GPIO17  (ESP32 TX2)    │
 *  └──────────────┴─────────────────────────┘
 *
 *  ⚠️  IMPORTANT: Do NOT use GPIO1/GPIO3 for GPS.
 *      Those are the USB Serial pins — it will break
 *      the Serial Monitor output.
 *
 *  LIBRARY: TinyGPS++ by Mikal Hart
 *    → Arduino IDE → Tools → Manage Libraries → search "TinyGPS++"
 *
 *  BOARD: ESP32 Dev Module
 *    → Tools → Board → esp32 → ESP32 Dev Module
 *
 *  SERIAL MONITOR: 115200 baud
 *
 *  NOTE: First GPS fix can take 30 seconds to 3 minutes.
 *        Place module near a window or outdoors.
 * ============================================================
 */

#include <TinyGPS++.h>
#include <HardwareSerial.h>

// ── Pins & Baud ──────────────────────────────────────────────
#define GPS_RX    16    // ESP32 RX2 ← GPS TX
#define GPS_TX    17    // ESP32 TX2 → GPS RX
#define GPS_BAUD  9600

// Set to true to also print raw NMEA sentences in Serial Monitor
// Useful for checking if GPS is sending data at all
#define SHOW_RAW_NMEA  false

// ── Objects ──────────────────────────────────────────────────
HardwareSerial gpsSerial(2);   // UART2 on ESP32
TinyGPSPlus    gps;

// ── Timing ───────────────────────────────────────────────────
unsigned long lastPrint = 0;
const unsigned long INTERVAL = 1000;   // Print every 1 second

// ── Counters ─────────────────────────────────────────────────
unsigned long totalChars     = 0;
unsigned long totalSentences = 0;
unsigned long failedSentences = 0;

// ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);

  // Start GPS serial port
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX, GPS_TX);

  Serial.println();
  Serial.println(F("================================================"));
  Serial.println(F("  GPS Only Test — ESP32 + NEO-6M"));
  Serial.println(F("  Board : ESP32 Dev Module"));
  Serial.println(F("  GPS   : GPIO16 (RX2) ← GPS TX"));
  Serial.println(F("          GPIO17 (TX2) → GPS RX"));
  Serial.println(F("================================================"));
  Serial.println(F("  Waiting for GPS data..."));
  Serial.println(F("  (First fix: 30s – 3min near a window)"));
  Serial.println(F("================================================\n"));
}

// ─────────────────────────────────────────────────────────────
void loop() {

  // Read all available bytes from GPS
  while (gpsSerial.available() > 0) {
    char c = gpsSerial.read();

    // Print raw NMEA to monitor if enabled
    if (SHOW_RAW_NMEA) {
      Serial.write(c);
    }

    // Feed into TinyGPS++ parser
    gps.encode(c);
    totalChars++;
  }

  // Print parsed report every INTERVAL ms
  if (millis() - lastPrint >= INTERVAL) {
    lastPrint = millis();
    printReport();
  }
}

// ─────────────────────────────────────────────────────────────
void printReport() {

  totalSentences  = gps.passedChecksum();
  failedSentences = gps.failedChecksum();

  Serial.println(F("------------------------------------------------"));

  // ── Signal Health ─────────────────────────────────────────
  Serial.print(F("  Raw chars   : ")); Serial.println(totalChars);
  Serial.print(F("  Sentences   : ")); Serial.println(totalSentences);
  Serial.print(F("  CRC errors  : ")); Serial.println(failedSentences);

  // Check if GPS is even sending anything
  if (totalChars == 0) {
    Serial.println();
    Serial.println(F("  *** NO DATA FROM GPS ***"));
    Serial.println(F("  → Check: GPS TX → GPIO16"));
    Serial.println(F("  → Check: GPS VCC → 3.3V"));
    Serial.println(F("  → Check: GPS GND → GND"));
    Serial.println(F("------------------------------------------------\n"));
    return;
  }

  Serial.println();

  // ── Satellites & Fix Quality ──────────────────────────────
  Serial.print(F("  Satellites  : "));
  if (gps.satellites.isValid())
    Serial.println(gps.satellites.value());
  else
    Serial.println(F("Searching..."));

  Serial.print(F("  HDOP        : "));
  if (gps.hdop.isValid()) {
    float h = gps.hdop.hdop();
    Serial.print(h, 2);
    if      (h <= 1.0) Serial.println(F("  [Excellent]"));
    else if (h <= 2.0) Serial.println(F("  [Good]"));
    else if (h <= 5.0) Serial.println(F("  [Moderate]"));
    else               Serial.println(F("  [Poor — move outdoors]"));
  } else {
    Serial.println(F("No fix yet"));
  }

  Serial.println();

  // ── Location ─────────────────────────────────────────────
  Serial.print(F("  Latitude    : "));
  if (gps.location.isValid()) {
    Serial.print(gps.location.lat(), 6);
    Serial.println(F("°"));
  } else {
    Serial.println(F("--- No fix ---"));
  }

  Serial.print(F("  Longitude   : "));
  if (gps.location.isValid()) {
    Serial.print(gps.location.lng(), 6);
    Serial.println(F("°"));
  } else {
    Serial.println(F("--- No fix ---"));
  }

  Serial.print(F("  Altitude    : "));
  if (gps.altitude.isValid()) {
    Serial.print(gps.altitude.meters(), 1);
    Serial.println(F(" m"));
  } else {
    Serial.println(F("INVALID"));
  }

  Serial.println();

  // ── Motion ───────────────────────────────────────────────
  Serial.print(F("  Speed       : "));
  if (gps.speed.isValid()) {
    Serial.print(gps.speed.kmph(), 2);
    Serial.println(F(" km/h"));
  } else {
    Serial.println(F("INVALID"));
  }

  Serial.print(F("  Course      : "));
  if (gps.course.isValid()) {
    Serial.print(gps.course.deg(), 1);
    Serial.print(F("°  "));
    Serial.println(courseToCompass(gps.course.deg()));
  } else {
    Serial.println(F("INVALID"));
  }

  Serial.println();

  // ── Date & Time (UTC) ────────────────────────────────────
  Serial.print(F("  Date (UTC)  : "));
  if (gps.date.isValid()) {
    char d[12];
    snprintf(d, sizeof(d), "%04d-%02d-%02d",
             gps.date.year(), gps.date.month(), gps.date.day());
    Serial.println(d);
  } else {
    Serial.println(F("INVALID"));
  }

  Serial.print(F("  Time (UTC)  : "));
  if (gps.time.isValid()) {
    char t[10];
    snprintf(t, sizeof(t), "%02d:%02d:%02d",
             gps.time.hour(), gps.time.minute(), gps.time.second());
    Serial.println(t);
  } else {
    Serial.println(F("INVALID"));
  }

  // ── Fix age (how fresh is the data) ──────────────────────
  Serial.print(F("  Fix age     : "));
  if (gps.location.isValid()) {
    Serial.print(gps.location.age());
    Serial.println(F(" ms ago"));
  } else {
    Serial.println(F("No fix"));
  }

  // ── Google Maps link (once fix acquired) ─────────────────
  if (gps.location.isValid()) {
    Serial.println();
    Serial.print(F("  Google Maps : https://maps.google.com/?q="));
    Serial.print(gps.location.lat(), 6);
    Serial.print(F(","));
    Serial.println(gps.location.lng(), 6);
  }

  Serial.println(F("------------------------------------------------\n"));
}

// ── Compass direction from course degrees ────────────────────
const char* courseToCompass(float deg) {
  if (deg <  22.5) return "N";
  if (deg <  67.5) return "NE";
  if (deg < 112.5) return "E";
  if (deg < 157.5) return "SE";
  if (deg < 202.5) return "S";
  if (deg < 247.5) return "SW";
  if (deg < 292.5) return "W";
  if (deg < 337.5) return "NW";
  return "N";
}
