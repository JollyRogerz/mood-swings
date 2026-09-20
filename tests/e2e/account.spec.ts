import { expect, test } from "@playwright/test";
// Passkeys are tied to a domain name, and an IP address is not one, so this
// spec always talks to the server as "localhost".
const home = (process.env.TEST_BASE_URL ?? "http://localhost:3000").replace(
  "127.0.0.1",
  "localhost",
);
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "virtual authenticator is a Chrome feature",
);
test("a guest saves a profile with a passkey and signs back in with it", async ({
  page,
  context,
}) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto(home);
  const name = `Tester_${Date.now() % 1_000_000}`;
  await page.getByRole("button", { name: "Save profile" }).click();
  const dialog = page.getByRole("dialog", { name: "Your profile" });
  // A bad username is explained before any account is made.
  await dialog.getByLabel("Username").fill("no");
  await dialog.getByRole("button", { name: "Save with a passkey" }).click();
  await expect(dialog.getByRole("alert")).toContainText("3 to 20");
  await dialog.getByLabel("Username").fill(name);
  await dialog.getByRole("button", { name: "Save with a passkey" }).click();
  await expect(dialog.getByRole("heading", { name })).toBeVisible();
  await expect(dialog).toContainText("Signed in on 1 device");
  // The profile survives a reload and names the player at the next table.
  await page.evaluate(() => localStorage.removeItem("mood-name"));
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Your profile" }),
  ).toContainText(name);
  await expect(
    page.getByPlaceholder("Something your friends call you"),
  ).toHaveValue(name);
  // Out, then back in with nothing but the passkey.
  await page.getByRole("button", { name: "Your profile" }).click();
  await dialog.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("button", { name: "Save profile" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save profile" }).click();
  await dialog.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(dialog.getByRole("heading", { name })).toBeVisible();
});
test("a cancelled passkey leaves no half-made account behind", async ({
  page,
}) => {
  // What the browser does when the player dismisses the passkey sheet.
  await page.addInitScript(
    `navigator.credentials.create = () => Promise.reject(new DOMException("cancelled", "NotAllowedError"));`,
  );
  await page.goto(home);
  await page.getByRole("button", { name: "Save profile" }).click();
  const dialog = page.getByRole("dialog", { name: "Your profile" });
  await dialog.getByLabel("Username").fill("NeverSaved");
  await dialog.getByRole("button", { name: "Save with a passkey" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  const state = await page.evaluate(async () =>
    (await fetch("/api/account")).json(),
  );
  expect(state.user).toBeNull();
});
