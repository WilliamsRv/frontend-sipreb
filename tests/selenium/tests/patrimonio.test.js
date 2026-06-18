import { expect } from "chai";
import { Builder, By } from "selenium-webdriver";
import fs from "fs";
import { LoginPage } from "../pages/LoginPage.js";
import { SidebarPage } from "../pages/SidebarPage.js";
import { AssetListPage } from "../pages/AssetListPage.js";
import { AssetModal } from "../pages/AssetModal.js";

const BASE = process.env.BASE_URL || "http://localhost:5173/sipreb";
const USER = process.env.USERNAME || "CarlosTocto";
const PASS = process.env.PASSWORD || "Admin@2026";

describe("Patrimonio", function () {
  this.timeout(180000);
  let driver;
  const DESCRIPCION = `Escritorio madera ofc - Selenium ${Date.now()}`;

  before(async function () {
    driver = await new Builder().forBrowser("chrome")
      .setChromeOptions(["--headless=new", "--no-sandbox", "--window-size=1440,900",
        "--enable-logging=stderr", "--v=1"
      ])
      .setLoggingPrefs({ browser: "ALL", performance: "ALL" })
      .build();
    const login = new LoginPage(driver, BASE);
    await login.navigateTo();
    await login.login(USER, PASS);
    await login.waitForDashboard();
  });

  after(async function () {
    await driver.quit();
  });

  it("Listado de Bienes", async function () {
    const s = new SidebarPage(driver, BASE);
    await s.goToBienes();
    const page = new AssetListPage(driver, BASE);
    expect(await page.isLoaded()).to.be.true;
  });

  it("Crear Bien completo", async function () {
    const s = new SidebarPage(driver, BASE);
    await s.goToBienes();
    const page = new AssetListPage(driver, BASE);

    await page.clickNuevoBien();
    const modal = new AssetModal(driver, BASE);
    await modal.waitOpen();
    await modal.fillAll(DESCRIPCION);
    await modal.save();

    await driver.sleep(5000);

    // Verificar si el modal se cerró (save exitoso)
    const errorDiv = By.xpath("//div[contains(@class,'bg-red-50') and contains(@class,'text-red-700')]");
    const hayError = await modal.isVisible(errorDiv, 3000);
    if (hayError) {
      const texto = await modal.getText(errorDiv);
      console.log(`ERROR: ${texto}`);
      // Capturar logs del navegador
      try {
        const logs = await driver.manage().logs().get("browser");
        for (const log of logs) {
          if (log.level.name === "SEVERE" || log.message.includes("Error") || log.message.includes("error")) {
            console.log(`[BROWSER ${log.level.name}] ${log.message}`);
          }
        }
      } catch (e) {
        console.log("No se pudieron capturar logs:", e.message);
      }
      // También obtener el body del modal para más contexto
      const bodyText = await driver.findElement(By.tagName("body")).getText();
      console.log(`Body snippet: ${bodyText.slice(200, 500)}`);
      // Tomar screenshot del error
      const img = await driver.takeScreenshot();
      fs.writeFileSync("reports/error_creacion.png", img, "base64");
      console.log("Screenshot guardado en reports/error_creacion.png");
      // Mostrar URL actual
      console.log(`URL: ${await driver.getCurrentUrl()}`);
    }
    expect(hayError).to.be.false;

    // Cerrar SweetAlert
    await driver.executeScript(`
      document.querySelectorAll('.swal2-container, .swal2-popup').forEach(el => el.remove());
      document.body.style.overflow = '';
    `);
    await driver.sleep(500);

    await s.goToBienes();
    await page.search(DESCRIPCION);
    await driver.sleep(2000);

    const count = await page.getRowCount();
    expect(count).to.be.at.least(1, `No encontrado: "${DESCRIPCION}"`);
  });
});
