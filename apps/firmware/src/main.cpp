/*
 * RunTimeZero — pond sensor node.
 *
 * Runs on a simulated ESP32 in Wokwi, but the firmware is real: it reads
 * analog probes, applies calibration, and publishes over MQTT exactly as a
 * deployed node would. Nothing here knows it is being simulated.
 *
 * WHY THIS MATTERS ARCHITECTURALLY
 * -------------------------------
 * The API receives pond data ONLY as MQTT messages from this node. It has no
 * path to the simulator's internal pond state. That makes the separation in
 * docs/DECISIONS.md #6 structural rather than a matter of discipline — the
 * reconciliation engine physically cannot see ground truth, because the only
 * thing that crosses the wire is a sensor reading.
 *
 * Sensor values come from potentiometers on the Wokwi canvas, so an evaluator
 * can turn a knob and watch the dashboard move. That is deliberate.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ----------------------------------------------------------------- config

// Wokwi's built-in open access point. No password, real internet.
static const char *WIFI_SSID = "Wokwi-GUEST";
static const char *WIFI_PASS = "";

// Public broker — fine for simulated pond data. Topic prefix is randomised per
// deployment so we do not collide with anyone else on the public broker.
static const char *MQTT_HOST = "broker.hivemq.com";
static const uint16_t MQTT_PORT = 1883;
static const char *TOPIC_PREFIX = "rtz/9f3a/pond";

// Identifies which pond this node is attached to. Must match a ponds.id row.
static const char *POND_ID = "pond-demo-001";

static const uint32_t PUBLISH_INTERVAL_MS = 5000;

// ADC pins. Real pH and DO probes output an analog voltage, so potentiometers
// stand in for them without changing how the firmware reads them.
static const uint8_t PIN_PH = 34;
static const uint8_t PIN_DO = 35;
static const uint8_t PIN_OD = 32;
static const uint8_t PIN_TEMP = 4;
static const uint8_t PIN_LED_TX = 13;

// ESP32 ADC is 12-bit over a 3.3 V reference.
static const float ADC_MAX = 4095.0f;
static const float V_REF = 3.3f;

// ------------------------------------------------------------ calibration

/*
 * Two-point calibration, the way a real probe is set up. These constants are
 * what turn a voltage into a number anyone would believe — and they are also
 * the first thing to suspect when a reading looks wrong.
 */
static const float PH_V_AT_PH4 = 0.40f;
static const float PH_V_AT_PH10 = 2.80f;

static const float DO_V_AT_ZERO = 0.10f;
static const float DO_MG_L_PER_VOLT = 6.25f;

// Optical density at 680 nm. Needs a fixed-path flow cell in the field:
// reading turbidity through open water gives a value that tracks the sun.
static const float OD_PER_VOLT = 0.90f;

WiFiClient net;
PubSubClient mqtt(net);
OneWire oneWire(PIN_TEMP);
DallasTemperature tempSensor(&oneWire);

static uint32_t lastPublish = 0;
static uint32_t seq = 0;

// ------------------------------------------------------------- helpers

static float readVolts(uint8_t pin) {
  return (analogRead(pin) / ADC_MAX) * V_REF;
}

static float voltsToPh(float v) {
  const float slope = (10.0f - 4.0f) / (PH_V_AT_PH10 - PH_V_AT_PH4);
  return 4.0f + (v - PH_V_AT_PH4) * slope;
}

static float voltsToDissolvedOxygen(float v) {
  const float mgL = (v - DO_V_AT_ZERO) * DO_MG_L_PER_VOLT;
  return mgL < 0.0f ? 0.0f : mgL;
}

static float voltsToOpticalDensity(float v) {
  return v * OD_PER_VOLT;
}

static void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("wifi: connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(200);
    Serial.print(".");
  }
  Serial.printf("\nwifi: up, ip=%s\n", WiFi.localIP().toString().c_str());
}

static void connectMqtt() {
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  while (!mqtt.connected()) {
    String clientId = String("rtz-") + POND_ID + "-" + String(random(0xffff), HEX);
    Serial.printf("mqtt: connecting as %s\n", clientId.c_str());
    if (mqtt.connect(clientId.c_str())) {
      Serial.println("mqtt: connected");
    } else {
      Serial.printf("mqtt: failed rc=%d, retrying\n", mqtt.state());
      delay(2000);
    }
  }
}

/*
 * Publishes one reading. The payload deliberately carries raw volts alongside
 * the derived value: if a calibration constant is wrong we can recompute
 * downstream instead of losing the observation.
 */
static void publishReading() {
  tempSensor.requestTemperatures();
  const float tempC = tempSensor.getTempCByIndex(0);

  const float vPh = readVolts(PIN_PH);
  const float vDo = readVolts(PIN_DO);
  const float vOd = readVolts(PIN_OD);

  char payload[320];
  snprintf(payload, sizeof(payload),
           "{\"pondId\":\"%s\",\"seq\":%lu,\"uptimeMs\":%lu,"
           "\"ph\":%.2f,\"dissolvedOxygenMgL\":%.2f,\"opticalDensity\":%.3f,"
           "\"temperatureC\":%.2f,"
           "\"raw\":{\"vPh\":%.4f,\"vDo\":%.4f,\"vOd\":%.4f}}",
           POND_ID, (unsigned long)seq, (unsigned long)millis(),
           voltsToPh(vPh), voltsToDissolvedOxygen(vDo), voltsToOpticalDensity(vOd),
           tempC, vPh, vDo, vOd);

  char topic[96];
  snprintf(topic, sizeof(topic), "%s/%s/telemetry", TOPIC_PREFIX, POND_ID);

  digitalWrite(PIN_LED_TX, HIGH);
  const bool ok = mqtt.publish(topic, payload);
  Serial.printf("tx[%lu] %s %s\n", (unsigned long)seq, ok ? "ok" : "FAIL", payload);
  delay(40);
  digitalWrite(PIN_LED_TX, LOW);

  seq++;
}

// ---------------------------------------------------------------- arduino

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED_TX, OUTPUT);
  digitalWrite(PIN_LED_TX, LOW);

  analogReadResolution(12);
  tempSensor.begin();

  connectWifi();
  connectMqtt();

  Serial.printf("node up: pond=%s topic=%s\n", POND_ID, TOPIC_PREFIX);
}

void loop() {
  if (!mqtt.connected()) {
    connectMqtt();
  }
  mqtt.loop();

  const uint32_t now = millis();
  if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
    lastPublish = now;
    publishReading();
  }
}
