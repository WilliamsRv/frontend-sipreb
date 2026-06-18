import { By } from "selenium-webdriver";
import { BasePage } from "./BasePage.js";

export class AssetListPage extends BasePage {
  TITLE = By.xpath("//h1[contains(.,'Gestión de Bienes')]");
  NUEVO_BIEN = By.xpath("//button[contains(.,'Nuevo Bien')]");
  TABLE_ROWS = By.css("tbody tr");
  SEARCH = By.xpath("//input[@placeholder='Buscar por código, descripción o marca...']");

  async isLoaded() {
    return this.isVisible(this.TITLE);
  }

  async getRowCount() {
    return (await this.driver.findElements(this.TABLE_ROWS)).length;
  }

  async search(term) {
    const el = await this.driver.findElement(this.SEARCH);
    await el.clear();
    await el.sendKeys(term);
  }

  async clickNuevoBien() {
    await this.jsClick(this.NUEVO_BIEN);
  }
}
