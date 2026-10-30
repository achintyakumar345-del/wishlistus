import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

const PAGE_SIZE = 250;
const MAX_PAGES = 8; // reads up to 2,000 customers

// Runs on the server when the merchant opens the page
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const counts = {};
  let scanned = 0;
  let customersWithWishlist = 0;
  let totalSaves = 0;
  let truncated = false;
  let cursor = null;

  // 1. Read every customer's wishlist metafield and count each product
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await admin.graphql(
      `#graphql
      query WishlistCustomers($first: Int!, $cursor: String) {
        customers(first: $first, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            metafield(namespace: "wishlistus", key: "items") { jsonValue }
          }
        }
      }`,
      { variables: { first: PAGE_SIZE, cursor } },
    );
    const { data } = await response.json();
    const connection = data.customers;

    for (const customer of connection.nodes) {
      scanned++;
      const items = Array.isArray(customer.metafield?.jsonValue)
        ? customer.metafield.jsonValue
        : [];
      if (!items.length) continue;
      customersWithWishlist++;
      totalSaves += items.length;
      for (const handle of items) counts[handle] = (counts[handle] || 0) + 1;
    }

    if (!connection.pageInfo.hasNextPage) break;
    cursor = connection.pageInfo.endCursor;
    if (page === MAX_PAGES - 1) truncated = true;
  }

  // 2. Rank products by how many customers saved them
  const ranked = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50);

  // 3. Fetch product details for the ranked handles
  let products = [];
  if (ranked.length) {
    const query = ranked.map(([handle]) => `handle:"${handle}"`).join(" OR ");
    const response = await admin.graphql(
      `#graphql
      query WishlistProducts($query: String!) {
        products(first: 50, query: $query) {
          nodes {
            id
            title
            handle
            totalInventory
            featuredMedia { preview { image { url altText } } }
          }
        }
      }`,
      { variables: { query } },
    );
    const { data } = await response.json();
    const byHandle = Object.fromEntries(
      data.products.nodes.map((p) => [p.handle, p]),
    );

    products = ranked.map(([handle, count]) => {
      const p = byHandle[handle];
      return {
        handle,
        count,
        title: p?.title || handle,
        image: p?.featuredMedia?.preview?.image?.url || null,
        inventory: p?.totalInventory ?? null,
        adminId: p ? p.id.split("/").pop() : null,
      };
    });
  }

  return {
    scanned,
    customersWithWishlist,
    totalSaves,
    uniqueProducts: Object.keys(counts).length,
    products,
    truncated,
  };
};

function Stat({ label, value }) {
  return (
    <s-box padding="base" background="subdued" borderRadius="base">
      <s-stack gap="small-200">
        <s-text color="subdued">{label}</s-text>
        <s-heading>{value}</s-heading>
      </s-stack>
    </s-box>
  );
}

// What the merchant sees
export default function WishlistsPage() {
  const {
    scanned,
    customersWithWishlist,
    totalSaves,
    uniqueProducts,
    products,
    truncated,
  } = useLoaderData();

  return (
    <s-page heading="Wishlists">
      <s-section heading="Overview">
        <s-stack direction="inline" gap="base">
          <Stat label="Customers with a wishlist" value={customersWithWishlist} />
          <Stat label="Total saved items" value={totalSaves} />
          <Stat label="Unique products saved" value={uniqueProducts} />
        </s-stack>
        {truncated && (
          <s-paragraph>
            Showing results from the first {scanned} customers.
          </s-paragraph>
        )}
      </s-section>

      {products.length === 0 ? (
        <s-section heading="Most wishlisted products">
          <s-paragraph>
            No wishlists yet. Once logged-in customers save products, they'll
            show up here.
          </s-paragraph>
        </s-section>
      ) : (
        <s-section padding="none" accessibilityLabel="Most wishlisted products">
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header listSlot="labeled" format="numeric">
                Wishlisted by
              </s-table-header>
              <s-table-header listSlot="labeled" format="numeric">
                Inventory
              </s-table-header>
            </s-table-header-row>
            <s-table-body>
              {products.map((p) => (
                <s-table-row key={p.handle}>
                  <s-table-cell>
                    <s-stack direction="inline" gap="base" alignItems="center">
                      {p.image && (
                        <s-thumbnail src={p.image} alt={p.title} size="small" />
                      )}
                      {p.adminId ? (
                        <s-link href={`shopify://admin/products/${p.adminId}`}>
                          {p.title}
                        </s-link>
                      ) : (
                        <s-text>{p.title}</s-text>
                      )}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    {p.count} {p.count === 1 ? "customer" : "customers"}
                  </s-table-cell>
                  <s-table-cell>{p.inventory ?? "—"}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}
    </s-page>
  );
}