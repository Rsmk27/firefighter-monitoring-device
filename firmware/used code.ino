#include <Wire.h>
#include <math.h>
#include <DHT.h>
#include <TinyGPS++.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// ================= WIFI + FIREBASE =================
const char* ssid = "The";
const char* password = "Rsmk2711";

String firebaseHost = "https://firefighter-rtdb.firebaseio.com/";
String firebaseAuth = "YOUR_FIREBASE_SECRET";  // Leave empty if Firebase rules allow open read/write, or add your secret here

// ================= DEFINITIONS =================
#define MPU_ADDR    0x68
#define DHTPIN      4
#define DHTTYPE     DHT11
#define SOS_BUTTON      14   // SOS button input  — GPIO14 (INPUT_PULLUP, Active LOW)
#define SOS_BUTTON_GND  27   // SOS button "GND"  — GPIO27 driven LOW to simulate ground
#define BUZZER          13
// Neo-6M GPS wiring:
//   ESP32 GPIO16 (GPS_RX)  <---  Neo-6M TX pin  (ESP32 receives NMEA from GPS)
//   ESP32 GPIO17 (GPS_TX)  --->  Neo-6M RX pin  (optional, only needed for config)
//   Neo-6M VCC = 3.3V     |   Neo-6M GND = GND
#define GPS_RX      16
#define GPS_TX      17

// Set to true to print raw NMEA sentences to Serial for debugging.
// Keep false in production.
#define GPS_DEBUG_RAW  false

// ================= MOVEMENT THRESHOLDS =================
// Time (seconds) of no movement before escalating state
#define WARN_SECONDS       10   // ⚠ WARNING  after 10 s no movement
#define EMERGENCY_SECONDS  30   // 🚨 EMERGENCY after 30 s no movement

// ================= MOVEMENT SENSITIVITY =================
// Deviation from 1g that counts as "no movement"
#define MOVE_THRESHOLD  0.13f

// ================= BUZZER TIMING =================
// Ambient temperature beep intervals (ms) – active only in NORMAL state
#define AMBIENT_BEEP_INTERVAL_MS  60000UL   // 1 minute between beep bursts
#define AMBIENT_BEEP_ON_MS          100UL   // Each beep is 100 ms ON

// Critical alert timing
#define WARNING_BEEP_ON_MS    200UL   // WARNING  : 300 ms ON
#define WARNING_BEEP_OFF_MS  1200UL   // WARNING  : 1200 ms OFF  → slow repeat
#define EMERGENCY_BEEP_ON_MS  200UL   // EMERGENCY: 200 ms ON
#define EMERGENCY_BEEP_OFF_MS 200UL   // EMERGENCY: 200 ms OFF  → rapid repeat
// SOS: continuous (buzzer always ON)

// ================= OBJECTS =================
DHT dht(DHTPIN, DHTTYPE);
TinyGPSPlus gps;
HardwareSerial gpsSerial(1);

// ================= SENSOR VARIABLES =================
int16_t AccX, AccY, AccZ;
float   Ax, Ay, Az;
float   totalAcc = 0;

// ================= MOVEMENT TRACKING =================
unsigned long noMoveStartTime = 0;
bool          notMoving        = false;
String        movementStatus   = "MOVING";

// ================= STATUS FLAGS =================
String deviceState  = "STARTUP";
String mpuStatus    = "OK";
String dhtStatus    = "OK";
String gpsStatus    = "OK";
String systemStatus = "OK";

// ================= SOS TOGGLE STATE =================
// Simple toggle: press 1 → ON, press 2 → OFF, etc.
bool          sosActive       = false;
bool          lastButtonState = HIGH;  // Active LOW
unsigned long lastDebounceTime = 0;
const unsigned long DEBOUNCE_MS = 200;

// ================= BUZZER STATE MACHINE =================
unsigned long buzzerTimer       = 0;   // Tracks last buzzer state change
bool          buzzerOn          = false;

// Ambient beep tracking (NORMAL state only)
unsigned long lastAmbientBurstTime = 0; // When the last burst started
int           ambientBeepCount     = 0; // How many beeps in this burst
int           ambientBeepsTarget   = 0; // How many beeps we must fire this burst
bool          ambientBeepInBurst   = false;
unsigned long ambientBeepTimer     = 0;
bool          ambientBeepPhase     = false; // false=ON phase, true=OFF gap between beeps

// ================= FIREBASE FUNCTION =================
void sendToFirebase(float temperature, double latitude, double longitude) {

  if (WiFi.status() == WL_CONNECTED) {

    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient https;
    String url = firebaseHost + "/firefighters/FF_001.json?auth=" + firebaseAuth;

    if (https.begin(client, url)) {

      https.addHeader("Content-Type", "application/json");

      String jsonData = "{";
      jsonData += "\"temperature\":"  + String(temperature)                   + ",";
      jsonData += "\"total_acc\":"    + String(totalAcc)                       + ",";
      jsonData += "\"movement\":\""   + movementStatus                  + "\",";
      jsonData += "\"status\":\""     + deviceState                     + "\",";
      jsonData += "\"mpu_status\":\"" + mpuStatus                       + "\",";
      jsonData += "\"dht_status\":\"" + dhtStatus                       + "\",";
      jsonData += "\"gps_status\":\"" + gpsStatus                       + "\",";
      jsonData += "\"system_status\":\"" + systemStatus                 + "\",";
      jsonData += "\"sos_active\":"   + String(sosActive ? "true" : "false") + ",";
      jsonData += "\"latitude\":"     + String(latitude, 6)                    + ",";
      jsonData += "\"longitude\":"    + String(longitude, 6)                   + ",";
      jsonData += "\"timestamp\":"    + String(millis());
      jsonData += "}";

      int httpCode = https.PUT(jsonData);
      Serial.print("Firebase Response: ");
      Serial.println(httpCode);

      https.end();
    }
  } else {
    Serial.println("WiFi Disconnected");
  }
}

// ================= HELPER: drive buzzer without blocking =================
// Call every loop iteration. Drives the buzzer based on current deviceState.
void handleBuzzer(float temperature) {

  unsigned long now = millis();

  // ----- SOS: buzzer fully ON (continuous) -----
  if (deviceState == "SOS") {
    digitalWrite(BUZZER, HIGH);
    buzzerOn = true;
    // Reset ambient tracking so it restarts cleanly when we leave SOS
    ambientBeepInBurst   = false;
    ambientBeepCount     = 0;
    lastAmbientBurstTime = now;
    return;
  }

  // ----- EMERGENCY: rapid 200 ms ON / 200 ms OFF -----
  if (deviceState == "EMERGENCY") {
    ambientBeepInBurst = false;
    ambientBeepCount   = 0;
    unsigned long interval = buzzerOn ? EMERGENCY_BEEP_ON_MS : EMERGENCY_BEEP_OFF_MS;
    if (now - buzzerTimer >= interval) {
      buzzerOn    = !buzzerOn;
      buzzerTimer = now;
      digitalWrite(BUZZER, buzzerOn ? HIGH : LOW);
    }
    return;
  }

  // ----- WARNING: slow 300 ms ON / 1200 ms OFF -----
  if (deviceState == "WARNING") {
    ambientBeepInBurst = false;
    ambientBeepCount   = 0;
    unsigned long interval = buzzerOn ? WARNING_BEEP_ON_MS : WARNING_BEEP_OFF_MS;
    if (now - buzzerTimer >= interval) {
      buzzerOn    = !buzzerOn;
      buzzerTimer = now;
      digitalWrite(BUZZER, buzzerOn ? HIGH : LOW);
    }
    return;
  }

  // ----- NORMAL: ambient temperature awareness beeps -----
  // Temperature ranges (prototype thresholds):
  //   < 25°C   → silent
  //   25–30°C  → 1 beep / min
  //   30–35°C  → 2 beeps / min
  //   35–40°C  → 3 beeps / min
  //   > 40°C   → state is already escalated before we get here

  int targetBeeps = 0;
  if (temperature >= 25.0f && temperature < 30.0f) targetBeeps = 1;
  else if (temperature >= 30.0f && temperature < 35.0f) targetBeeps = 2;
  else if (temperature >= 35.0f && temperature <= 40.0f) targetBeeps = 3;

  if (targetBeeps == 0) {
    // Silent range — keep buzzer off, reset burst state
    digitalWrite(BUZZER, LOW);
    buzzerOn             = false;
    ambientBeepInBurst   = false;
    ambientBeepCount     = 0;
    lastAmbientBurstTime = now;
    return;
  }

  // Check if it's time to start a new burst
  if (!ambientBeepInBurst) {
    if (now - lastAmbientBurstTime >= AMBIENT_BEEP_INTERVAL_MS) {
      // Kick off a new burst
      ambientBeepInBurst  = true;
      ambientBeepsTarget  = targetBeeps;
      ambientBeepCount    = 0;
      ambientBeepPhase    = false;  // start with ON
      ambientBeepTimer    = now;
      digitalWrite(BUZZER, HIGH);
      buzzerOn = true;
    } else {
      // Waiting for next minute — buzzer off
      digitalWrite(BUZZER, LOW);
      buzzerOn = false;
    }
    return;
  }

  // Mid-burst: cycle through beeps
  if (!ambientBeepPhase) {
    // Currently in ON phase
    if (now - ambientBeepTimer >= AMBIENT_BEEP_ON_MS) {
      digitalWrite(BUZZER, LOW);
      buzzerOn          = false;
      ambientBeepPhase  = true;   // switch to OFF/gap phase
      ambientBeepTimer  = now;
      ambientBeepCount++;         // completed one beep

      if (ambientBeepCount >= ambientBeepsTarget) {
        // Burst finished
        ambientBeepInBurst   = false;
        lastAmbientBurstTime = now;
      }
    }
  } else {
    // Currently in OFF/gap phase between consecutive beeps
    if (now - ambientBeepTimer >= AMBIENT_BEEP_ON_MS) {
      // Gap done — start next beep ON
      digitalWrite(BUZZER, HIGH);
      buzzerOn         = true;
      ambientBeepPhase = false;
      ambientBeepTimer = now;
    }
  }
}

// ================= SETUP =================
void setup() {

  Serial.begin(115200);

  // WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected");

  // I2C
  Wire.begin(21, 22);
  Wire.setClock(100000);

  // Wake MPU6050
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0);
  Wire.endTransmission(true);

  dht.begin();
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);

  // SOS button: GPIO27 = simulated GND, GPIO14 = input
  pinMode(SOS_BUTTON_GND, OUTPUT);
  digitalWrite(SOS_BUTTON_GND, LOW);   // Hold LOW permanently → acts as GND
  pinMode(SOS_BUTTON, INPUT_PULLUP);

  pinMode(BUZZER, OUTPUT);
  digitalWrite(BUZZER, LOW);

  lastAmbientBurstTime = millis(); // Start the 1-min ambient timer from boot

  Serial.println("SFMS System Started");
  delay(2000);
}

// ================= MAIN LOOP =================
void loop() {

  // Reset to baseline each iteration; priority is applied below
  systemStatus = "OK";
  deviceState  = "NORMAL";

  // ================= MPU6050 READ =================
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);

  if (Wire.endTransmission(false) != 0) {
    mpuStatus   = "ERROR";
    systemStatus = "SENSOR_FAILURE";
  } else {
    Wire.requestFrom(MPU_ADDR, 6, true);

    if (Wire.available() < 6) {
      mpuStatus   = "ERROR";
      systemStatus = "SENSOR_FAILURE";
    } else {
      AccX = Wire.read() << 8 | Wire.read();
      AccY = Wire.read() << 8 | Wire.read();
      AccZ = Wire.read() << 8 | Wire.read();

      Ax = AccX / 16384.0f;
      Ay = AccY / 16384.0f;
      Az = AccZ / 16384.0f;

      totalAcc = sqrt(Ax * Ax + Ay * Ay + Az * Az);
      mpuStatus = "OK";
    }
  }

  // ================= MOVEMENT LOGIC =================
  // Priority: SOS > EMERGENCY > WARNING > NORMAL
  float movement = abs(totalAcc - 1.0f);

  if (movement < MOVE_THRESHOLD) {
    if (!notMoving) {
      noMoveStartTime = millis();
      notMoving       = true;
    }
  } else {
    // Movement detected → reset inactivity timer
    notMoving = false;
  }

  unsigned long noMoveDuration = notMoving
      ? (millis() - noMoveStartTime) / 1000UL
      : 0UL;

  if (!notMoving) {
    movementStatus = "MOVING";
    // deviceState stays NORMAL
  } else if (noMoveDuration >= EMERGENCY_SECONDS) {
    // 🚨 EMERGENCY: no movement for 30+ seconds
    movementStatus = "NOT MOVING LONG TIME (" + String(noMoveDuration) + " sec)";
    deviceState    = "EMERGENCY";
  } else if (noMoveDuration >= WARN_SECONDS) {
    // ⚠ WARNING: no movement for 10–29 seconds
    movementStatus = "NOT MOVING (" + String(noMoveDuration) + " sec)";
    deviceState    = "WARNING";
  }

  // ================= DHT11 READ =================
  float temperature = dht.readTemperature();

  if (isnan(temperature)) {
    dhtStatus    = "ERROR";
    systemStatus = "SENSOR_FAILURE";
    temperature  = -999;
  } else {
    dhtStatus = "OK";

    // Temperature > 40°C escalates to at least WARNING if not already higher
    // (per spec: > 40°C switches to WARNING/EMERGENCY logic)
    if (temperature > 40.0f) {
      if (deviceState == "NORMAL") {
        deviceState = "WARNING"; // escalate; inactivity timers may push to EMERGENCY
      }
    }
  }

  // ================= GPS =================
  // Feed all available bytes to TinyGPS++ parser.
  // Also optionally echo raw NMEA to Serial for debugging.
  while (gpsSerial.available()) {
    char c = gpsSerial.read();
    gps.encode(c);
#if GPS_DEBUG_RAW
    Serial.write(c);  // Print raw NMEA sentence — use this to confirm data is arriving
#endif
  }

  double latitude  = 0;
  double longitude = 0;

  // gps.location.isValid()  → TinyGPS++ parsed a complete, non-void fix
  // gps.location.age()      → milliseconds since last valid fix (should be < 2000 ms)
  // gps.satellites.value()  → number of satellites locked (need >= 3 for 2D fix)
  if (gps.location.isValid() && gps.location.age() < 5000) {
    latitude  = gps.location.lat();
    longitude = gps.location.lng();
    gpsStatus = "OK";
  } else if (gps.charsProcessed() < 10) {
    // No characters at all received from GPS – wiring or baud rate problem
    gpsStatus = "NO_DATA";
  } else {
    // Data is flowing but no valid fix yet (searching for satellites)
    gpsStatus = "SEARCHING (" + String(gps.satellites.value()) + " sats)";
  }

  // ================= SOS TOGGLE (Simple press-to-toggle) =================
  // GPIO 0 = built-in BOOT button (Active LOW)
  // Press 1 → SOS ON   |   Press 2 → SOS OFF   (clean toggle, debounced)
  bool currentButtonState = digitalRead(SOS_BUTTON);

  // Detect falling-edge (button pressed down) with debounce
  if (currentButtonState == LOW && lastButtonState == HIGH) {
    unsigned long now = millis();
    if (now - lastDebounceTime >= DEBOUNCE_MS) {
      lastDebounceTime = now;

      // Toggle SOS state
      sosActive = !sosActive;

      if (sosActive) {
        Serial.println(">>> SOS ACTIVATED <<<");
      } else {
        Serial.println(">>> SOS DEACTIVATED – returning to NORMAL <<<");
      }
    }
  }
  lastButtonState = currentButtonState;

  // ================= STATE PRIORITY ENFORCEMENT =================
  // SOS overrides all sensor-based states
  if (sosActive) {
    deviceState = "SOS";
  }
  // (EMERGENCY and WARNING are already applied above; SOS has highest priority)

  // ================= BUZZER =================
  handleBuzzer(temperature);

  // ================= SERIAL DEBUG OUTPUT =================
  Serial.println("\n==== FIREFIGHTER REPORT ====");
  Serial.print("State: ");          Serial.println(deviceState);
  Serial.print("Movement: ");       Serial.println(movementStatus);
  Serial.print("Temperature: ");    Serial.println(temperature);
  Serial.print("No-Move Duration: "); Serial.print(noMoveDuration); Serial.println(" sec");
  Serial.print("MPU Status: ");     Serial.println(mpuStatus);
  Serial.print("DHT Status: ");     Serial.println(dhtStatus);
  Serial.print("GPS Status: ");     Serial.println(gpsStatus);
  Serial.print("GPS Chars Processed: "); Serial.println(gps.charsProcessed());
  Serial.print("GPS Satellites: ");  Serial.println(gps.satellites.value());
  Serial.print("GPS Fix Age (ms): "); Serial.println(gps.location.age());
  Serial.print("GPS Lat/Lng: ");     Serial.print(latitude, 6); Serial.print(" / "); Serial.println(longitude, 6);
  Serial.print("System Status: ");  Serial.println(systemStatus);
  Serial.print("SOS Active: ");     Serial.println(sosActive ? "YES" : "NO");
  Serial.println("============================");

  // ================= FIREBASE =================
  sendToFirebase(temperature, latitude, longitude);

  // No blocking delay – loop runs continuously so GPS/MPU read at full speed
}