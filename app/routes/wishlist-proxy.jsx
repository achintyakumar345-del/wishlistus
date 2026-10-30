import { authenticate } from "../shopify.server";

const NAMESPACE = "wishlistus";
const KEY = "items";

function clean(items) {
  if (!Array.isArray(items)) return [];
  const handles = items.filter((h) => typeof h === "string" && h.length > 0 && h.length < 256);
  return [...new Set(handles)].slice(0, 100);
}

function getCustomerGid(request) {
  const id = new URL(request.url).searchParams.get("logged_in_customer_id");
  return id ? `gid://shopify/Customer/${id}` : null;
}

// GET /apps/wishlist  ->  read the logged-in customer's wishlist
export const loader = async ({ request }) => {
  const { admin } = await authenticate.public.appProxy(request);
  const customerGid = getCustomerGid(request);

  if (!customerGid || !admin) {
    return Response.json({ loggedIn: false, items: [] });
  }

  try {
    const response = await admin.graphql(
      `#graphql
      query WishlistRead($id: ID!) {
        customer(id: $id) {
          metafield(namespace: "wishlistus", key: "items") {
            jsonValue
          }
        }
      }`,
      { variables: { id: customerGid } },
    );
    const { data } = await response.json();

    return Response.json({
      loggedIn: true,
      items: clean(data?.customer?.metafield?.jsonValue),
    });
  } catch (error) {
    return Response.json(
      {
        error: error.message,
        details: error.body?.errors?.graphQLErrors || null,
      },
      { status: 500 },
    );
  }
};

// POST /apps/wishlist  ->  save the logged-in customer's wishlist
export const action = async ({ request }) => {
  const { admin } = await authenticate.public.appProxy(request);
  const customerGid = getCustomerGid(request);

  if (!customerGid || !admin) {
    return Response.json({ error: "Not logged in" }, { status: 401 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch (e) {
    body = {};
  }
  const items = clean(body.items);

  const response = await admin.graphql(
    `#graphql
    mutation WishlistWrite($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: customerGid,
            namespace: NAMESPACE,
            key: KEY,
            type: "json",
            value: JSON.stringify(items),
          },
        ],
      },
    },
  );
  const { data } = await response.json();
  const errors = data?.metafieldsSet?.userErrors || [];

  if (errors.length) {
    return Response.json({ error: errors[0].message }, { status: 400 });
  }
  return Response.json({ loggedIn: true, items });
};