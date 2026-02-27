#include <Wire.h>
#include <math.h>
#include <DHT.h>
#include <TinyGPS++.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// ================= WIFI + FIREBASE =================
const char* ssid = "YOUR_WIFI_NAME";
const char* password = "YOUR_WIFI_PASSWORD";

String firebaseHost = "https://YOUR_FIREBASE_URL.firebaseio.com";
String firebaseAuth = "YOUR_FIREBASE_SECRET";

// ================= DEFINITIONS =================
#define MPU_ADDR 0x68
#define DHTPIN 4
#define DHTTYPE DHT11
#define SOS_BUTTON 0   // Built-in BOOT push button on ESP32 (GPIO 0, Active LOW)
#define BUZZER 12
#define GPS_RX 16
#define GPS_TX 17

// ================= OBJECTS =================
DHT dht(DHTPIN, DHTTYPE);
TinyGPSPlus gps;
HardwareSerial gpsSerial(1);

// ================= SENSOR VARIABLES =================
int16_t AccX, AccY, AccZ;
float Ax, Ay, Az;
float totalAcc = 0;

// ================= MOVEMENT TRACKING =================
unsigned long noMoveStartTime = 0;
bool notMoving = false;
String movementStatus = "MOVING";

// ================= BUZZER CONTROL =================
unsigned long buzzerTimer = 0;
bool buzzerState = false;

// ================= STATUS FLAGS =================
String deviceState = "STARTUP";
String mpuStatus = "OK";
String dhtStatus = "OK";
String gpsStatus = "OK";
String systemStatus = "OK";
// ================= SOS LATCH STATE =================
bool sosActive = false;          // TRUE = SOS latched ON
int  sosDeactivateCount = 0;     // Counts presses after SOS is activated (needs 2 to cancel)
bool lastButtonState = HIGH;     // Previous raw button reading (Active LOW)
unsigned long lastDebounceTime = 0;
const unsigned long DEBOUNCE_MS = 200;  // Ignore bounces within 200ms

// ================= FIREBASE FUNCTION =================
void sendToFirebase(float temperature,
                    double latitude,
                    double longitude) {

  if (WiFi.status() == WL_CONNECTED) {

    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient https;

    String url = firebaseHost + "/firefighters/FF_001.json?auth=" + firebaseAuth;

    if (https.begin(client, url)) {

      https.addHeader("Content-Type", "application/json");

      String jsonData = "{";
      jsonData += "\"temperature\":" + String(temperature) + ",";
      jsonData += "\"total_acc\":" + String(totalAcc) + ",";
      jsonData += "\"movement\":\"" + movementStatus + "\",";
      jsonData += "\"status\":\"" + deviceState + "\",";
      jsonData += "\"mpu_status\":\"" + mpuStatus + "\",";
      jsonData += "\"dht_status\":\"" + dhtStatus + "\",";
      jsonData += "\"gps_status\":\"" + gpsStatus + "\",";
      jsonData += "\"system_status\":\"" + systemStatus + "\",";
      jsonData += "\"sos_active\":" + String(sosActive ? "true" : "false") + ",";
      jsonData += "\"latitude\":" + String(latitude,6) + ",";
      jsonData += "\"longitude\":" + String(longitude,6) + ",";
      jsonData += "\"timestamp\":" + String(millis());
      jsonData += "}";

      int httpCode = https.PUT(jsonData);

      Serial.print("Firebase Response: ");
      Serial.println(httpCode);

      https.end();
    }
  }
  else {
    Serial.println("WiFi Disconnected");
  }
}

void setup() {

  Serial.begin(115200);

  // WiFi Connection
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected");

  // I2C
  Wire.begin(21,22);
  Wire.setClock(100000);

  // Wake MPU6050
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0);
  Wire.endTransmission(true);

  dht.begin();
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);

  pinMode(SOS_BUTTON, INPUT_PULLUP);
  pinMode(BUZZER, OUTPUT);

  Serial.println("SFMS System Started");
  delay(2000);
}

void loop() {

  systemStatus = "OK";
  deviceState = "NORMAL";

  // ================= MPU6050 =================
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);

  if (Wire.endTransmission(false) != 0) {
    mpuStatus = "ERROR";
    systemStatus = "SENSOR_FAILURE";
  }
  else {

    Wire.requestFrom(MPU_ADDR, 6, true);

    if (Wire.available() < 6) {
      mpuStatus = "ERROR";
      systemStatus = "SENSOR_FAILURE";
    }
    else {

      AccX = Wire.read() << 8 | Wire.read();
      AccY = Wire.read() << 8 | Wire.read();
      AccZ = Wire.read() << 8 | Wire.read();

      Ax = AccX / 16384.0;
      Ay = AccY / 16384.0;
      Az = AccZ / 16384.0;

      totalAcc = sqrt(Ax*Ax + Ay*Ay + Az*Az);
      mpuStatus = "OK";
    }
  }

  // ================= MOVEMENT LOGIC =================
  float movement = abs(totalAcc - 1.0);

  // Lowered threshold to 0.03 to detect small movements like breathing or shifting
  if (movement < 0.03) {
    if (!notMoving) {
      noMoveStartTime = millis();
      notMoving = true;
    }
  } else {
    notMoving = false;
  }

  unsigned long noMoveDuration = 0;
  if (notMoving) {
    noMoveDuration = (millis() - noMoveStartTime) / 1000;
  }

  if (!notMoving) {
    movementStatus = "MOVING";
  }
  else if (noMoveDuration >= 5 && noMoveDuration < 15) {
    movementStatus = "NOT MOVING (" + String(noMoveDuration) + " sec)";
    deviceState = "WARNING";
  }
  else if (noMoveDuration >= 15) {
    movementStatus = "NOT MOVING LONG TIME (" + String(noMoveDuration) + " sec)";
    deviceState = "EMERGENCY";
  }

  // ================= DHT =================
  float temperature = dht.readTemperature();

  if (isnan(temperature)) {
    dhtStatus = "ERROR";
    systemStatus = "SENSOR_FAILURE";
    temperature = -999;
  }
  else {
    dhtStatus = "OK";
  }

  if (temperature > 50) {
    deviceState = "EMERGENCY (HIGH TEMP)";
  }

  // ================= GPS =================
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }

  double latitude = 0;
  double longitude = 0;

  if (gps.location.isValid()) {
    latitude = gps.location.lat();
    longitude = gps.location.lng();
    gpsStatus = "OK";
  }
  else {
    gpsStatus = "NO_SIGNAL";
  }

  // ================= SOS (Latching Toggle) =================
  // GPIO 0 = built-in BOOT button on ESP32 (Active LOW)
  // Behaviour:
  //   Press 1       → SOS activates and STAYS on
  //   Press 2 + 3   → SOS deactivates (requires 2 presses to prevent accidental cancel)
  bool currentButtonState = digitalRead(SOS_BUTTON);
  bool buttonJustPressed = false;

  // Detect rising edge (button released after being pressed) with debounce
  if (currentButtonState == HIGH && lastButtonState == LOW) {
    unsigned long now = millis();
    if (now - lastDebounceTime >= DEBOUNCE_MS) {
      buttonJustPressed = true;
      lastDebounceTime = now;
    }
  }
  lastButtonState = currentButtonState;

  if (buttonJustPressed) {
    if (!sosActive) {
      // First press — latch SOS ON
      sosActive = true;
      sosDeactivateCount = 0;
      Serial.println(">>> SOS ACTIVATED <<<");
    } else {
      // SOS already active — count cancel presses
      sosDeactivateCount++;
      Serial.print("SOS cancel press: ");
      Serial.print(sosDeactivateCount);
      Serial.println(" / 2");
      if (sosDeactivateCount >= 2) {
        sosActive = false;
        sosDeactivateCount = 0;
        Serial.println(">>> SOS DEACTIVATED <<<");
      }
    }
  }

  if (sosActive) {
    deviceState = "SOS";
  }

  // ================= BUZZER =================
  if (deviceState == "NORMAL") {
    digitalWrite(BUZZER, LOW);
  }
  else if (deviceState == "WARNING") {
    if (millis() - buzzerTimer >= 1000) {
      buzzerTimer = millis();
      buzzerState = !buzzerState;
      digitalWrite(BUZZER, buzzerState);
    }
  }
  else {
    digitalWrite(BUZZER, HIGH);
  }

  // ================= SERIAL OUTPUT =================
  Serial.println("\n==== FIREFIGHTER REPORT ====");
  Serial.print("State: "); Serial.println(deviceState);
  Serial.print("Movement: "); Serial.println(movementStatus);
  Serial.print("Temperature: "); Serial.println(temperature);
  Serial.print("MPU Status: "); Serial.println(mpuStatus);
  Serial.print("DHT Status: "); Serial.println(dhtStatus);
  Serial.print("GPS Status: "); Serial.println(gpsStatus);
  Serial.print("System Status: "); Serial.println(systemStatus);
  Serial.print("SOS Active: "); Serial.println(sosActive ? "YES (press 2x to cancel)" : "NO");
  Serial.println("============================");

  // ================= FIREBASE =================
  sendToFirebase(temperature, latitude, longitude);

  // delay(5000); // Removed blocking delay so GPS and MPU can read continuously
}