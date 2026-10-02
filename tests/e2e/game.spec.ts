import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute(
    "data-kurokawa-ready",
    "true",
  );
});

test("卓につき、牌を捨て、AI三家の後に次のツモへ進む", async ({ page }) => {
  await page.getByTestId("sit-button").click();

  await expect(page.getByTestId("game-table")).toBeVisible();
  await expect(page.getByTestId("turn-seat")).toContainText("東家の手番");
  await expect(page.getByTestId("drawn-tile")).toBeVisible();
  await expect(page.getByTestId("wall-count")).toHaveText("69");
  await expect(page.getByLabel("ドラ表示牌")).toBeVisible();
  await expect(page.getByTestId("points-you")).toHaveText("25,000");

  await page.getByTestId("drawn-tile").click();

  await expect(page.getByTestId("human-discard-count")).toContainText("1枚");
  await expect(page.getByTestId("human-river").locator(".tile")).toHaveCount(1);
  for (let step = 0; step < 80; step += 1) {
    if ((await page.getByTestId("turn-seat").textContent())?.includes("東家の手番")) {
      break;
    }
    const pass = page.getByRole("button", { name: "見送る" });
    if (await pass.isVisible()) await pass.click();
    await page.waitForTimeout(80);
  }
  await expect(page.getByTestId("turn-seat")).toContainText("東家の手番", { timeout: 5_000 });
  await expect(page.getByTestId("drawn-tile")).toBeVisible();
  expect(Number(await page.getByTestId("wall-count").textContent())).toBeLessThan(69);
});

test("設定を開閉し、席を立って開始画面へ戻れる", async ({ page }) => {
  await page.getByRole("button", { name: "設定" }).click();
  await expect(page.getByRole("dialog", { name: "設定" })).toBeVisible();
  const matchType = page.getByRole("combobox", { name: "対局形式" });
  const bankruptcyToggle = page.getByRole("checkbox", { name: "箱割れで終了" });
  const soundToggle = page.getByRole("checkbox", { name: "対局の効果音" });
  const callsToggle = page.getByRole("checkbox", { name: "鳴き（チー・ポン・大明槓）" });
  await expect(matchType).toHaveValue("hanchan");
  await matchType.selectOption("full");
  await expect(matchType).toHaveValue("full");
  await expect(bankruptcyToggle).toBeChecked();
  await bankruptcyToggle.uncheck();
  await expect(bankruptcyToggle).not.toBeChecked();
  await expect(soundToggle).toBeChecked();
  await expect(callsToggle).toBeChecked();
  await callsToggle.uncheck();
  await expect(callsToggle).not.toBeChecked();
  await soundToggle.uncheck();
  await expect(soundToggle).not.toBeChecked();
  await page.getByRole("button", { name: "完了" }).click();

  await page.getByTestId("sit-button").click();
  await expect(page.getByTestId("round-name")).toHaveText("東一局");
  await page.getByRole("button", { name: "席を立つ" }).click();

  await expect(page.getByRole("heading", { name: /余白のある卓で/ })).toBeVisible();
  await expect(page.getByText("一荘戦・四人打ち")).toBeVisible();
});

test("対局卓がブラウザの表示領域内に収まる", async ({ page }) => {
  await page.getByTestId("sit-button").click();
  await expect(page.getByTestId("game-table")).toBeVisible();

  const fitsViewport = await page.evaluate(
    () => document.documentElement.scrollHeight <= window.innerHeight + 1,
  );
  expect(fitsViewport).toBe(true);

  const table = await page.getByTestId("game-table").boundingBox();
  const leftHand = await page.getByLabel(/北家の手牌/).boundingBox();
  const rightHand = await page.getByLabel(/南家の手牌/).boundingBox();
  expect(table).not.toBeNull();
  expect(leftHand).not.toBeNull();
  expect(rightHand).not.toBeNull();
  expect(leftHand!.x).toBeLessThan(table!.x + table!.width * 0.18);
  expect(rightHand!.x + rightHand!.width).toBeGreaterThan(
    table!.x + table!.width * 0.82,
  );
});

test("一局の結果から点数を保って次局へ進む", async ({ page }) => {
  await page.evaluate(() => {
    window.localStorage.setItem(
      "kurokawa-settings",
      JSON.stringify({ aiDelay: 120, showGuide: false, soundEnabled: false, callsEnabled: false }),
    );
  });
  await page.reload();
  await page.getByTestId("sit-button").click();

  const nextHand = page.getByTestId("next-hand-button");
  for (let step = 0; step < 180 && !(await nextHand.isVisible()); step += 1) {
    const ron = page.getByTestId("ron-button");
    const tsumo = page.getByTestId("tsumo-button");
    const drawn = page.getByTestId("drawn-tile");
    if (await ron.isVisible()) {
      await ron.click();
    } else if (await tsumo.isVisible()) {
      await tsumo.click();
    } else if ((await drawn.isVisible()) && (await drawn.isEnabled())) {
      await drawn.click();
    }
    await page.waitForTimeout(90);
  }

  await expect(nextHand).toHaveText("次局へ", { timeout: 5_000 });
  const previousRound = await page.getByTestId("round-name").textContent();
  const previousHonba = await page.getByTestId("honba-count").textContent();
  const previousPoints = await page.getByTestId("points-you").textContent();

  await page.getByRole("button", { name: "設定" }).click();
  await page.getByRole("combobox", { name: "AIの速さ" }).selectOption("700");
  await page.getByRole("button", { name: "完了" }).click();
  await nextHand.click();

  await expect(page.getByTestId("wall-count")).toHaveText("69");
  await expect(page.getByTestId("human-discard-count")).toContainText("0枚");
  await expect(page.getByTestId("points-you")).toHaveText(previousPoints ?? "");
  const nextRound = await page.getByTestId("round-name").textContent();
  const nextHonba = await page.getByTestId("honba-count").textContent();
  expect(`${nextRound}/${nextHonba}`).not.toBe(`${previousRound}/${previousHonba}`);
});
