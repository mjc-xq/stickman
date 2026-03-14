#include <M5StickCPlus2.h>

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("SERIAL OK - before M5 init");

  auto cfg = M5.config();
  cfg.serial_baudrate = 115200;
  StickCP2.begin(cfg);
  Serial.println("M5 INIT DONE");

  StickCP2.Display.setRotation(3);
  StickCP2.Display.fillScreen(BLACK);
  StickCP2.Display.setTextSize(2);
  StickCP2.Display.setCursor(10, 10);
  StickCP2.Display.setTextColor(GREEN);
  StickCP2.Display.println("Stickman");
  StickCP2.Display.setCursor(10, 40);
  StickCP2.Display.setTextColor(WHITE);
  StickCP2.Display.println("Connected!");

  Serial.println("M5StickC Plus 2 ready.");
}

void loop() {
  StickCP2.update();

  static unsigned long last = 0;
  if (millis() - last > 2000) {
    last = millis();
    Serial.printf("alive %lu ms\n", millis());
  }

  if (StickCP2.BtnA.wasPressed()) {
    Serial.println("Button A pressed");
  }

  delay(20);
}
