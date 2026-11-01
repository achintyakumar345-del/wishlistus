import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

// Keep in sync with DEFAULTS in extensions/wishlist-button/assets/wishlist.js
const DEFAULTS = {
  toastEnabled: true,
  toastAddedText: "Added to your wishlist",
  toastRemovedText: "Removed from your wishlist",
  toastPosition: "bottom",
  toastDuration: 3,
  animation: "pop",
};
const POSITIONS = ["top", "bottom"];
const ANIMATIONS = ["none", "pop", "bounce", "pulse"];

// Settings live in an app-data metafield on the app installation,
// which the theme app extension reads in Liquid via app.metafields.wishlistus.settings
const SETTINGS_QUERY = `#graphql
  query WishlistSettings {
    currentAppInstallation {
      id
      settings: metafield(namespace: "wishlistus", key: "settings") {
        jsonValue
      }
    }
  }`;

async function loadSettings(admin) {
  const response = await admin.graphql(SETTINGS_QUERY);
  const { data } = await response.json();
  const installation = data.currentAppInstallation;
  return {
    installationId: installation.id,
    settings: { ...DEFAULTS, ...(installation.settings?.jsonValue || {}) },
  };
}

// Strip characters that could break out of the storefront <script> tag
function cleanText(value, fallback) {
  const text = String(value || "").replace(/[<>]/g, "").trim().slice(0, 100);
  return text || fallback;
}

// Runs on the server when the merchant opens the page
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const { settings } = await loadSettings(admin);
  return { settings };
};

// Runs on the server when the merchant clicks Save
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const { installationId } = await loadSettings(admin);

  const duration = Math.round(Number(form.get("toastDuration")));
  const position = form.get("toastPosition");
  const animation = form.get("animation");

  const settings = {
    toastEnabled: form.get("toastEnabled") === "true",
    toastAddedText: cleanText(form.get("toastAddedText"), DEFAULTS.toastAddedText),
    toastRemovedText: cleanText(form.get("toastRemovedText"), DEFAULTS.toastRemovedText),
    toastPosition: POSITIONS.includes(position) ? position : DEFAULTS.toastPosition,
    toastDuration: Number.isFinite(duration)
      ? Math.min(10, Math.max(1, duration))
      : DEFAULTS.toastDuration,
    animation: ANIMATIONS.includes(animation) ? animation : DEFAULTS.animation,
  };

  const response = await admin.graphql(
    `#graphql
    mutation SaveWishlistSettings($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: installationId,
            namespace: "wishlistus",
            key: "settings",
            type: "json",
            value: JSON.stringify(settings),
          },
        ],
      },
    },
  );
  const { data } = await response.json();
  return { settings, errors: data.metafieldsSet.userErrors };
};

// What the merchant sees
export default function SettingsPage() {
  const { settings } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const saving = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.errors?.length) {
      shopify.toast.show(fetcher.data.errors[0].message, { isError: true });
    } else {
      shopify.toast.show("Settings saved");
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // An unchecked switch sends nothing, so send an explicit true/false
    data.set("toastEnabled", data.has("toastEnabled") ? "true" : "false");
    fetcher.submit(data, { method: "post" });
  };

  return (
    <s-page heading="Settings">
      {/* key resets the form to the saved values after each save */}
      <form
        key={JSON.stringify(settings)}
        data-save-bar
        onSubmit={handleSubmit}
      >
        <s-section heading="Toast message">
          <s-stack gap="base">
            <s-paragraph color="subdued">
              A short message shoppers see after adding or removing a product.
            </s-paragraph>
            <s-switch
              label="Show toast message"
              name="toastEnabled"
              value="true"
              defaultChecked={settings.toastEnabled}
            />
            <s-text-field
              label="Message when a product is added"
              name="toastAddedText"
              defaultValue={settings.toastAddedText}
              maxLength={100}
            />
            <s-text-field
              label="Message when a product is removed"
              name="toastRemovedText"
              defaultValue={settings.toastRemovedText}
              maxLength={100}
            />
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-select
                label="Position"
                name="toastPosition"
                value={settings.toastPosition}
              >
                <s-option value="top">Top of screen</s-option>
                <s-option value="bottom">Bottom of screen</s-option>
              </s-select>
              <s-number-field
                label="Show for"
                name="toastDuration"
                suffix="seconds"
                defaultValue={String(settings.toastDuration)}
                min={1}
                max={10}
                step={1}
              />
            </s-grid>
          </s-stack>
        </s-section>

        <s-section heading="Heart animation">
          <s-select
            label="Animation when the heart is clicked"
            name="animation"
            value={settings.animation}
            details="Shoppers who have reduced motion turned on won't see animations."
          >
            <s-option value="none">None</s-option>
            <s-option value="pop">Pop</s-option>
            <s-option value="bounce">Bounce</s-option>
            <s-option value="pulse">Pulse</s-option>
          </s-select>
        </s-section>

        <s-stack direction="inline" justifyContent="end">
          <s-button variant="primary" type="submit" loading={saving}>
            Save
          </s-button>
        </s-stack>
      </form>
    </s-page>
  );
}
