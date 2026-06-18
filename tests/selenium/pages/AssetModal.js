import { By, until } from "selenium-webdriver";
import { Select } from "selenium-webdriver";
import { BasePage } from "./BasePage.js";

export class AssetModal extends BasePage {
  GRUPO_SBN = By.xpath("//label[contains(.,'Grupo SBN')]/following::select[1]");
  SBN_CODE = By.xpath("//select[@name='sbnCode']");
  DESCRIPTION = By.xpath("//input[@name='description']");
  CATEGORY_INPUT = By.xpath("//input[@role='combobox']");
  ACQ_DATE = By.xpath("//input[@name='acquisitionDate']");
  ACQ_VALUE = By.xpath("//input[@name='acquisitionValue']");
  ACQ_TYPE = By.xpath("//select[@name='acquisitionType']");
  USEFUL_LIFE = By.xpath("//input[@name='usefulLife']");
  INVOICE = By.xpath("//input[@name='invoiceNumber']");
  PURCHASE_ORDER = By.xpath("//input[@name='purchaseOrderNumber']");
  ALTA_DOC_TYPE = By.xpath("//select[@name='altaDocType']");
  ALTA_DOC_NUMBER = By.xpath("//input[@name='altaDocNumber']");
  ALTA_DATE = By.xpath("//input[@name='altaDate']");
  ACCOUNT_CODE = By.xpath("//input[@name='accountCode']");

  TAB_FINANCIERA = By.xpath("//button[contains(.,'Información Financiera')]");
  TAB_UBICACION = By.xpath("//button[contains(.,'Ubicación')]");
  TAB_DOCS = By.xpath("//button[contains(.,'Documentación')]");
  SAVE = By.xpath("//button[contains(.,'Guardar')]");

  async waitOpen() {
    await this.driver.wait(until.elementLocated(this.SBN_CODE), 10000);
    await this.driver.sleep(500);
  }

  async _pickCombobox(label) {
    try {
      const input = await this.driver.findElement(
        By.xpath(`//label[contains(.,'${label}')]/following::input[@role='combobox']`)
      );
      await this.driver.wait(until.elementIsVisible(input), 3000);
      await input.click();
      await this.driver.sleep(500);
      const opts = await this.driver.findElements(By.css("[role='combobox'] + ul li:not(:first-child)"));
      if (opts.length > 0) {
        await opts[0].click();
        await this.driver.sleep(300);
        return true;
      }
    } catch { }
    return false;
  }

  async fillAll(desc) {
    // TAB 1: IDENTIFICACIÓN
    await new Select(await this.driver.findElement(this.GRUPO_SBN)).selectByValue("MOBILIARIO");
    await this.driver.sleep(800);
    await new Select(await this.driver.findElement(this.SBN_CODE)).selectByValue("51111001");
    await this.driver.sleep(1500);

    // Replace auto-generated assetCode with a unique one (readOnly field, use JS)
    const uniqueCode = `SEL-${Date.now().toString(36).toUpperCase()}`;
    await this.driver.executeScript(`
      const input = document.querySelector('input[name="assetCode"]');
      if (input) {
        const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        proto.set.call(input, arguments[0]);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    `, uniqueCode);
    await this.driver.sleep(300);

    await (await this.driver.findElement(this.DESCRIPTION)).sendKeys(desc);
    await this._pickCombobox("Categoría");

    // TAB 3: FINANCIERA
    await this.jsClick(this.TAB_FINANCIERA);
    await this.driver.sleep(500);
    await (await this.driver.findElement(this.ACQ_DATE)).sendKeys("01012025");
    await (await this.driver.findElement(this.ACQ_VALUE)).sendKeys("2500");
    await new Select(await this.driver.findElement(this.ACQ_TYPE)).selectByValue("COMPRA");
    await (await this.driver.findElement(this.USEFUL_LIFE)).sendKeys("120");

    // TAB 4: UBICACIÓN
    await this.jsClick(this.TAB_UBICACION);
    await this.driver.sleep(500);
    await this._pickCombobox("Ubicación");
    await this._pickCombobox("Responsable");
    await this._pickCombobox("Área");
    await this._pickCombobox("Usuario Final");

    // TAB 5: DOCUMENTACIÓN
    await this.jsClick(this.TAB_DOCS);
    await this.driver.sleep(500);
    await new Select(await this.driver.findElement(this.ALTA_DOC_TYPE)).selectByValue("PECOSA");
    await (await this.driver.findElement(this.INVOICE)).sendKeys("F001-12345");
    await (await this.driver.findElement(this.PURCHASE_ORDER)).sendKeys("OC-2026-000789");
    await (await this.driver.findElement(this.ALTA_DOC_NUMBER)).sendKeys("PECOSA-2026-001234");
    await (await this.driver.findElement(this.ALTA_DATE)).sendKeys("01012025");
    await (await this.driver.findElement(this.ACCOUNT_CODE)).sendKeys("1503.0701");
  }

  async save() {
    await this.jsClick(this.SAVE);
  }
}
