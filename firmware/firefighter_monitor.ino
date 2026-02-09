#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <DHT.h>
#include <TinyGPS++.h>
#include <Wire.h>

// --- Configuration ---
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "http://YOUR_SERVER_IP:3000/api/data"; // Replace with your computer's IP if testing locally

// --- Pin Definitions ---
#define DHTPIN 4
#define DHTTYPE DHT11
#define BUZZER_PIN 18
#define LED_PIN 2         // Status LED (Onboard often 2)
#define ALERT_LED_PIN 5   // External Alert LED
#define SOS_BUTTON_PIN 15

// GPS using HardwareSerial 2 (check your board's pinout)
#define RXD2 16
#define TXD2 17

// --- Objects ---
DHT dht(DHTPIN, DHTTYPE);
Adafruit_MPU6050 mpu;
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);

// --- State Definitions ---
enum SystemState {
  STARTUP,
  NORMAL,
  WARNING,
  EMERGENCY,
  SOS
};

SystemState currentState = STARTUP;
const char* stateStrings[] = {"STARTUP", "NORMAL", "WARNING", "EMERGENCY", "SOS"};

// --- Variables ---
String deviceId = "FF_001";
unsigned long lastSendTime = 0;
const unsigned long sendInterval = 3000; // 3 seconds
bool sosActive = false;
unsigned long lastMovementTime = 0;
const unsigned long movementTimeout = 30000; // 30 seconds for warning

void setup() {
  Serial.begin(115200);
  gpsSerial.begin(9600, SERIAL_8N1, RXD2, TXD2);

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(ALERT_LED_PIN, OUTPUT);
  pinMode(SOS_BUTTON_PIN, INPUT_PULLUP); // Wire button to GND

  dht.begin();
  Wire.begin();
  
  if (!mpu.begin()) {
    Serial.println("Failed to find MPU6050 chip");
    while (1) {
      delay(10);
    }
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  // Connect to WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("");
  Serial.println("WiFi connected");
  
  currentState = NORMAL;
  lastMovementTime = millis();
}

void loop() {
  // 1. Read Sensors
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  float temperature = dht.readTemperature();
  if (isnan(temperature)) {
    temperature = 0.0; // Handle error
  }

  // GPS Reading
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // 2. Process Logic
  
  // SOS Check
  if (digitalRead(SOS_BUTTON_PIN) == LOW) { // Button pressed (active low)
    sosActive = !sosActive; // Toggle or set permanently? Usually latching until reset. 
    // Let's make it latch to SOS state if pressed.
    currentState = SOS;
    delay(500); // Debounce
  }

  // Movement Detection
  float movementMagnitude = sqrt(pow(a.acceleration.x, 2) + pow(a.acceleration.y, 2) + pow(a.acceleration.z, 2));
  // Gravity is ~9.8. Significant movement deviates from gravity.
  // Checking for "stillness"
  if (abs(movementMagnitude - 9.8) > 2.0) { // Threshold for movement
     lastMovementTime = millis();
     if (currentState != SOS) currentState = NORMAL; // Reset to normal if moving and not SOS
  }

  // Temperature Logic
  if (temperature > 50.0) {
    if (currentState != SOS) currentState = EMERGENCY;
  } else if (temperature > 40.0) {
    if (currentState != SOS && currentState != EMERGENCY) currentState = WARNING;
  }

  // Inactivity Logic
  if (millis() - lastMovementTime > movementTimeout) {
     if (currentState != SOS && currentState != EMERGENCY) currentState = WARNING;
     if (millis() - lastMovementTime > movementTimeout * 2) { // 60s
        if (currentState != SOS) currentState = EMERGENCY;
     }
  }

  // 3. Local Alerts
  handleAlerts();

  // 4. Send Data
  if (millis() - lastSendTime > sendInterval) {
    sendData(temperature, movementMagnitude > 11.0 ? "MOVING" : "STILL"); // Simple logic for string
    lastSendTime = millis();
  }
}

void handleAlerts() {
  if (currentState == WARNING) {
    digitalWrite(ALERT_LED_PIN, HIGH);
    digitalWrite(LED_PIN, LOW);
    // Beep occasionally?
    digitalWrite(BUZZER_PIN, (millis() / 500) % 2); 
  } else if (currentState == EMERGENCY || currentState == SOS) {
    digitalWrite(ALERT_LED_PIN, HIGH); 
    digitalWrite(LED_PIN, LOW);
    digitalWrite(BUZZER_PIN, HIGH); // Continuous beep
  } else {
    digitalWrite(ALERT_LED_PIN, LOW);
    digitalWrite(LED_PIN, HIGH); // Heartbeat LED
    digitalWrite(BUZZER_PIN, LOW);
  }
}

void sendData(float temp, String moveState) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    // Construct JSON
    String json = "{";
    json += "\"device_id\":\"" + deviceId + "\",";
    json += "\"temperature\":" + String(temp, 1) + ","; // Float with 1 decimal
    json += "\"movement\":\"" + moveState + "\",";
    json += "\"status\":\"" + String(stateStrings[currentState]) + "\",";
    
    // GPS
    json += "\"latitude\":";
    if (gps.location.isValid()) json += String(gps.location.lat(), 6);
    else json += "0.0";
    json += ",";
    
    json += "\"longitude\":";
    if (gps.location.isValid()) json += String(gps.location.lng(), 6);
    else json += "0.0";
    json += ",";
    
    // Timestamp added by server usually, but we can send simplified ISO if needed. 
    // For now, let server timestamp it.
    json += "\"timestamp\":\"" + String(millis()) + "\""; // Just sending millis for debug
    json += "}";

    int httpResponseCode = http.POST(json);
    
    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println(httpResponseCode);
      Serial.println(response);
    } else {
      Serial.print("Error on sending POST: ");
      Serial.println(httpResponseCode);
    }
    http.end();
  } else {
    Serial.println("WiFi Disconnected");
  }
}
