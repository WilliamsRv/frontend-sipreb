import { By, until } from "selenium-webdriver";
import { BasePage } from "./BasePage.js";

export class SidebarPage extends BasePage {
  async goToBienes() {
    await this.driver.get(`${this.baseUrl}/bienes`);
    await this.driver.wait(until.elementLocated(
      By.xpath("//h1[contains(.,'Gestión de Bienes')]")
    ), 20000);
  }
}
