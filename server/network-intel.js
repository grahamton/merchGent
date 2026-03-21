/**
 * Network Intelligence Layer
 * Intercepts XHR/fetch responses during page load, fingerprints commerce platforms,
 * extracts structured data directly from APIs, and parses dataLayer/digitalData events.
 */

// ─── Platform fingerprints ────────────────────────────────────────────────────

/**
 * Get a nested value from an object using a dot-path string.
 * Returns undefined if any segment is missing.
 */
function getPath(obj, dotPath) {
  if (!obj || !dotPath) return undefined;
  return dotPath.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

/**
 * Normalize a raw product from a platform-specific shape to the standard merch-connector shape.
 */
export function normalizeApiProduct(raw, platform) {
  if (!raw || typeof raw !== 'object') return null;

  // Helper to find first truthy value from multiple candidate paths
  const pick = (...paths) => {
    for (const p of paths) {
      const v = typeof p === 'string' ? getPath(raw, p) : p;
      if (v != null && v !== '') return v;
    }
    return null;
  };

  let title = null;
  let price = null;
  let stockStatus = null;
  let imageAlt = null;
  let imageSrc = null;
  let ctaText = null;
  let description = null;
  let sku = null;
  let brand = null;
  let categories = [];
  let rating = null;
  let reviewCount = null;
  let attributes = {};

  switch (platform) {
    case 'algolia':
      title = pick('name', 'title', 'product_name', 'productName');
      price = pick('price', 'price_usd', 'price.value', 'salePrice', 'selling_price');
      stockStatus = pick('availability', 'in_stock', 'stock_status', 'inStock');
      imageSrc = pick('image', 'image_url', 'imageUrl', 'thumbnail', 'picture');
      imageAlt = pick('name', 'title');
      sku = pick('sku', 'objectID', 'product_id', 'id');
      brand = pick('brand', 'manufacturer', 'vendor');
      categories = [].concat(pick('categories', 'category', 'hierarchicalCategories') || []);
      rating = pick('rating', 'avg_rating', 'average_rating', 'reviewRating');
      reviewCount = pick('reviewCount', 'review_count', 'num_reviews', 'reviews');
      description = pick('description', 'short_description', 'summary');
      break;

    case 'elasticsearch':
    case 'opensearch': {
      const src = raw._source || raw;
      title = pick(getPath(src, 'name'), getPath(src, 'title'), getPath(src, 'product_name'));
      price = pick(getPath(src, 'price'), getPath(src, 'sale_price'), getPath(src, 'regular_price'));
      stockStatus = pick(getPath(src, 'stock_status'), getPath(src, 'availability'), getPath(src, 'in_stock'));
      imageSrc = pick(getPath(src, 'image_url'), getPath(src, 'image'), getPath(src, 'thumbnail'));
      sku = pick(getPath(src, 'sku'), getPath(src, 'id'), raw._id);
      brand = pick(getPath(src, 'brand'), getPath(src, 'manufacturer'));
      categories = [].concat(getPath(src, 'categories') || getPath(src, 'category') || []);
      rating = pick(getPath(src, 'rating'), getPath(src, 'average_rating'));
      reviewCount = pick(getPath(src, 'review_count'), getPath(src, 'num_reviews'));
      description = pick(getPath(src, 'description'), getPath(src, 'short_description'));
      // Capture remaining src fields as attributes
      attributes = { ...src };
      break;
    }

    case 'coveo':
      title = pick('title', 'raw.title', 'raw.systitle');
      price = pick('raw.price', 'raw.ec_price', 'raw.sale_price');
      stockStatus = pick('raw.ec_stock', 'raw.availability', 'raw.in_stock');
      imageSrc = pick('raw.ec_images', 'raw.thumbnailurl');
      sku = pick('raw.permanentid', 'raw.ec_sku', 'uniqueId');
      brand = pick('raw.ec_brand', 'raw.brand');
      categories = [].concat(pick('raw.ec_category', 'raw.categories') || []);
      rating = pick('raw.ec_rating', 'raw.rating');
      reviewCount = pick('raw.ec_review_count');
      description = pick('excerpt', 'raw.ec_shortdesc', 'raw.description');
      break;

    case 'sfcc':
      title = pick('product_name', 'name', 'productName');
      price = pick('price', 'sales.formatted', 'list.formatted', 'priceMax');
      stockStatus = pick('availability.messages', 'available') ;
      imageSrc = pick('image.link', 'images[0].link', 'image');
      sku = pick('product_id', 'id', 'master.master_id');
      brand = pick('brand');
      categories = [].concat(pick('primary_category_id') || []);
      rating = pick('rating');
      reviewCount = pick('reviews.total');
      description = pick('short_description', 'long_description');
      break;

    case 'shopify':
      title = pick('title');
      price = pick('price', 'variants[0].price', 'price_min');
      stockStatus = pick('available') != null
        ? (raw.available ? 'In Stock' : 'Out of Stock') : null;
      imageSrc = pick('featured_image', 'images[0]', 'image.src');
      sku = pick('id', 'variants[0].sku');
      brand = pick('vendor');
      categories = [].concat(pick('product_type') || []);
      description = pick('body_html', 'description', 'handle');
      break;

    case 'magento':
      title = pick('name', 'sku');
      price = pick('price', 'final_price', 'price_range.minimum_price.final_price.value');
      stockStatus = pick('stock_status', 'stock_item.is_in_stock');
      imageSrc = pick('media_gallery_entries[0].file', 'thumbnail.url');
      sku = pick('sku', 'id');
      brand = pick('brand', 'manufacturer');
      categories = [].concat(pick('categories') || []).map((c) => c.name || c);
      description = pick('description.html', 'short_description.html', 'description');
      break;

    case 'commercetools':
      title = pick('name.en', 'name.en-US', 'name');
      price = pick('masterVariant.prices[0].value.centAmount');
      if (price != null) price = (price / 100).toFixed(2);
      imageSrc = pick('masterVariant.images[0].url', 'masterVariant.images[0]');
      sku = pick('id', 'masterVariant.sku', 'key');
      categories = [].concat(pick('categories') || []).map((c) => c.id || c);
      description = pick('description.en', 'description.en-US');
      break;

    case 'sap_hybris':
      title = pick('name', 'summary');
      price = pick('price.formattedValue', 'price.value');
      stockStatus = pick('stock.stockLevelStatus', 'stock.stockLevel');
      imageSrc = pick('images[0].url', 'thumbnailImage');
      sku = pick('code', 'averageRating');
      brand = pick('manufacturer');
      description = pick('description', 'summary');
      rating = pick('averageRating');
      reviewCount = pick('numberOfReviews');
      break;

    case 'bloomreach':
    case 'lucidworks_fusion':
    case 'solr':
    case 'searchspring':
      title = pick('title', 'name', 'product_name', 'product_title');
      price = pick('price', 'ss_price', 'sale_price', 'final_price');
      stockStatus = pick('availability', 'stock_status', 'in_stock');
      imageSrc = pick('thumbnailImage', 'thumbnail_url', 'image_url', 'ss_image');
      sku = pick('uid', 'id', 'sku', 'product_id');
      brand = pick('brand', 'manufacturer');
      categories = [].concat(pick('categories', 'category') || []);
      description = pick('description', 'short_description', 'content');
      break;

    case 'klevu':
      title = pick('name', 'itemName');
      price = pick('salePrice', 'price', 'startPrice');
      imageSrc = pick('imageUrl', 'image');
      sku = pick('id', 'itemGroupId');
      brand = pick('brand');
      description = pick('shortDesc', 'description');
      break;

    case 'constructor_io':
      title = pick('value', 'data.name', 'matched_terms[0]');
      price = pick('data.price', 'data.sale_price');
      imageSrc = pick('data.image_url', 'data.thumbnail');
      sku = pick('data.id', 'data.sku');
      brand = pick('data.brand');
      description = pick('data.description');
      break;

    case 'hawksearch':
      title = pick('ProductName', 'BestFragment');
      price = pick('Price', 'SalePrice');
      imageSrc = pick('Thumbnail', 'ImageFile');
      sku = pick('Sku', 'DocId');
      brand = pick('Brand');
      description = pick('ShortDescription', 'Description');
      break;

    case 'attraqt':
      title = pick('name', 'title');
      price = pick('price', 'salePrice');
      imageSrc = pick('imageUri', 'image');
      sku = pick('id');
      break;

    case 'unbxd':
      title = pick('title', 'name', 'productName');
      price = pick('price', 'selling_price');
      imageSrc = pick('imageUrl', 'image_url');
      sku = pick('uniqueId', 'pid');
      brand = pick('brand');
      description = pick('description');
      break;

    case 'yext':
      title = pick('name', 'data.name');
      description = pick('data.c_body', 'description', 'data.description');
      imageSrc = pick('data.photoGallery[0].image.url', 'data.headshot.url');
      sku = pick('id', 'data.id');
      break;

    case 'google_retail':
      title = pick('product.title', 'title');
      price = pick('product.priceInfo.price', 'priceInfo.price');
      imageSrc = pick('product.images[0].uri', 'images[0].uri');
      sku = pick('product.id', 'id');
      brand = pick('product.brands[0]', 'brands[0]');
      categories = [].concat(pick('product.categories') || []);
      description = pick('product.description', 'description');
      break;

    case 'bazaarvoice':
      title = pick('ProductStatistics.ProductId', 'ReviewStatistics.AverageOverallRating');
      rating = pick('ReviewStatistics.AverageOverallRating', 'QAStatistics.AverageOverallRating');
      reviewCount = pick('ReviewStatistics.TotalReviewCount');
      sku = pick('ProductId', 'ProductStatistics.ProductId');
      break;

    case 'powerreviews':
      rating = pick('rollup.average_rating');
      reviewCount = pick('rollup.review_count');
      sku = pick('page_id', 'merchant_group_id');
      break;

    case 'yotpo':
      rating = pick('response.bottomline.average_score', 'bottomline.average_score');
      reviewCount = pick('response.bottomline.total_review', 'bottomline.total_review');
      break;

    default:
      // Generic fallback — try common field names
      title = pick('name', 'title', 'product_name', 'productName', 'displayName');
      price = pick('price', 'salePrice', 'sale_price', 'finalPrice', 'final_price');
      stockStatus = pick('availability', 'stock_status', 'in_stock', 'available');
      imageSrc = pick('image', 'imageUrl', 'image_url', 'thumbnail');
      sku = pick('sku', 'id', 'product_id', 'itemId');
      brand = pick('brand', 'manufacturer', 'vendor');
      categories = [].concat(pick('categories', 'category') || []);
      rating = pick('rating', 'average_rating', 'avgRating');
      reviewCount = pick('reviewCount', 'review_count', 'numReviews');
      description = pick('description', 'short_description', 'summary');
  }

  // Normalize price to a displayable string
  if (price != null && typeof price === 'number') {
    price = `$${price.toFixed(2)}`;
  } else if (price != null) {
    price = String(price);
  }

  // Normalize stockStatus booleans
  if (stockStatus === true) stockStatus = 'In Stock';
  if (stockStatus === false) stockStatus = 'Out of Stock';
  if (stockStatus != null) stockStatus = String(stockStatus);

  // Normalize categories to string array
  categories = categories.flat().filter(Boolean).map(String).slice(0, 10);

  return {
    title: title ? String(title).slice(0, 200) : null,
    price: price || null,
    stockStatus: stockStatus || 'Unknown',
    imageAlt: imageAlt || title || null,
    imageSrc: imageSrc ? String(imageSrc).slice(0, 500) : null,
    ctaText: ctaText || 'View Details',
    description: description ? String(description).slice(0, 240) : null,
    b2bIndicators: [],
    b2cIndicators: [],
    trustSignals: {
      starRating: rating != null ? parseFloat(rating) : null,
      reviewCount: reviewCount != null ? parseInt(reviewCount, 10) : null,
      bestSeller: false,
      isNew: false,
      onSale: false,
      saleText: null,
      stockWarning: null,
      sustainabilityLabel: null,
      badges: [],
    },
    // Extended API-sourced fields
    sku: sku ? String(sku) : null,
    brand: brand ? String(brand).slice(0, 100) : null,
    categories,
    rating: rating != null ? parseFloat(rating) : null,
    reviewCount: reviewCount != null ? parseInt(reviewCount, 10) : null,
    attributes,
  };
}

/**
 * Normalize a raw facet/filter to the standard merch-connector facet shape.
 */
export function normalizeApiFacet(raw, platform) {
  if (!raw || typeof raw !== 'object') return null;

  let name = null;
  let type = 'checkbox';
  let options = [];

  switch (platform) {
    case 'algolia': {
      // Algolia facets: { "brand": { "Nike": 42, "Adidas": 18 } } — raw is [name, counts]
      if (Array.isArray(raw) && raw.length === 2) {
        name = String(raw[0]);
        const counts = raw[1];
        if (counts && typeof counts === 'object') {
          options = Object.entries(counts).map(([label, count]) => ({
            label, value: label, count: Number(count), selected: false,
          }));
        }
      } else {
        name = raw.name || raw.attribute || String(raw);
      }
      break;
    }

    case 'elasticsearch':
    case 'opensearch': {
      // ES aggregation bucket: { key: name, doc_count: N } inside a named agg
      name = raw.name || raw.field || raw.key || 'Filter';
      const buckets = raw.buckets || (raw.filter_agg && raw.filter_agg.buckets) || [];
      options = buckets.map((b) => ({
        label: String(b.key ?? b.name ?? ''),
        value: String(b.key ?? ''),
        count: Number(b.doc_count ?? b.count ?? 0),
        selected: false,
      }));
      break;
    }

    case 'coveo': {
      name = raw.field || raw.id || raw.displayName || 'Filter';
      options = (raw.values || []).map((v) => ({
        label: String(v.value ?? v.lookupValue ?? ''),
        value: String(v.value ?? ''),
        count: Number(v.numberOfResults ?? v.count ?? 0),
        selected: !!v.state && v.state !== 'idle',
      }));
      if (raw.type === 'numericalRange') type = 'range';
      break;
    }

    case 'sfcc': {
      name = raw.display_name || raw.attribute_id || 'Filter';
      options = (raw.values || []).map((v) => ({
        label: String(v.label ?? v.value ?? ''),
        value: String(v.value ?? ''),
        count: Number(v.hit_count ?? 0),
        selected: !!v.selected,
      }));
      break;
    }

    case 'sap_hybris': {
      name = raw.name || raw.code || 'Filter';
      type = raw.multiSelect ? 'checkbox' : 'list';
      options = (raw.values || []).map((v) => ({
        label: String(v.name ?? v.code ?? ''),
        value: String(v.code ?? v.query?.query?.value ?? ''),
        count: Number(v.count ?? 0),
        selected: !!v.selected,
      }));
      break;
    }

    case 'searchspring': {
      name = raw.label || raw.field || 'Filter';
      type = raw.multiple === 'single' ? 'list' : 'checkbox';
      options = (raw.values || []).map((v) => ({
        label: String(v.label ?? v.value ?? ''),
        value: String(v.value ?? ''),
        count: Number(v.count ?? 0),
        selected: !!v.filtered,
      }));
      break;
    }

    case 'bloomreach':
    case 'solr':
    case 'lucidworks_fusion': {
      // Solr facet_fields: ["field_name", ["val1", count1, "val2", count2, ...]]
      if (Array.isArray(raw) && raw.length === 2) {
        name = String(raw[0]);
        const vals = raw[1];
        if (Array.isArray(vals)) {
          for (let i = 0; i < vals.length - 1; i += 2) {
            options.push({ label: String(vals[i]), value: String(vals[i]), count: Number(vals[i + 1]), selected: false });
          }
        }
      } else {
        name = raw.name || raw.field || 'Filter';
        options = (raw.values || raw.buckets || []).map((v) => ({
          label: String(v.label ?? v.key ?? ''),
          value: String(v.value ?? v.key ?? ''),
          count: Number(v.count ?? v.doc_count ?? 0),
          selected: false,
        }));
      }
      break;
    }

    case 'constructor_io': {
      name = raw.display_name || raw.name || 'Filter';
      options = (raw.options || []).map((o) => ({
        label: String(o.display_name ?? o.value ?? ''),
        value: String(o.value ?? ''),
        count: Number(o.count ?? 0),
        selected: !!o.status,
      }));
      break;
    }

    case 'shopify': {
      name = raw.label || raw.id || 'Filter';
      type = raw.type === 'PRICE_RANGE' ? 'range' : 'checkbox';
      options = (raw.values || []).map((v) => ({
        label: String(v.label ?? v.input ?? ''),
        value: String(v.input ?? v.label ?? ''),
        count: Number(v.count ?? 0),
        selected: !!v.isActive,
      }));
      break;
    }

    default: {
      name = raw.name || raw.field || raw.label || raw.displayName || raw.attribute || 'Filter';
      const rawValues = raw.values || raw.options || raw.buckets || raw.items || [];
      options = rawValues.map((v) => ({
        label: String(v.label ?? v.name ?? v.key ?? v.value ?? ''),
        value: String(v.value ?? v.key ?? ''),
        count: Number(v.count ?? v.doc_count ?? 0),
        selected: !!v.selected || !!v.active || !!v.checked,
      }));
    }
  }

  if (!name) return null;
  options = options.filter((o) => o.label.length > 0).slice(0, 50);

  return {
    name: String(name).slice(0, 80),
    type,
    optionCount: options.length,
    options,
    selectedCount: options.filter((o) => o.selected).length,
    source: 'api',
  };
}

// ─── Platform fingerprint registry ───────────────────────────────────────────

export const PLATFORM_FINGERPRINTS = [
  // ── Search / discovery platforms ──────────────────────────────────────────
  {
    id: 'algolia',
    name: 'Algolia',
    category: 'search',
    urlPatterns: [/algolia\.net/i, /algolianet\.com/i, /algolia\.io/i],
    domainPatterns: ['algolia.net', 'algolianet.com'],
    responseSignals: {
      required: ['hits'],
      facetPath: 'facets',
      productPath: 'hits',
      totalPath: 'nbHits',
    },
    extractProducts: (body) => (body.hits || []).map((h) => normalizeApiProduct(h, 'algolia')).filter(Boolean),
    extractFacets: (body) => {
      const facets = body.facets || {};
      return Object.entries(facets).map(([k, v]) => normalizeApiFacet([k, v], 'algolia')).filter(Boolean);
    },
  },
  {
    id: 'elasticsearch',
    name: 'Elasticsearch',
    category: 'search',
    urlPatterns: [/_search(\?|$|\/)/i, /\/search\/query/i, /elasticsearch/i],
    domainPatterns: [],
    responseSignals: {
      required: ['hits.hits'],
      facetPath: 'aggregations',
      productPath: 'hits.hits',
      totalPath: 'hits.total.value',
    },
    extractProducts: (body) => ((body.hits && body.hits.hits) || []).map((h) => normalizeApiProduct(h, 'elasticsearch')).filter(Boolean),
    extractFacets: (body) => {
      const aggs = body.aggregations || {};
      return Object.entries(aggs).map(([name, agg]) => {
        const buckets = agg.buckets || (agg.filter_agg && agg.filter_agg.buckets) || [];
        return normalizeApiFacet({ name, buckets }, 'elasticsearch');
      }).filter(Boolean);
    },
  },
  {
    id: 'opensearch',
    name: 'OpenSearch',
    category: 'search',
    urlPatterns: [/opensearch/i, /\/_search(\?|$)/i],
    domainPatterns: ['opensearch'],
    responseSignals: {
      required: ['hits.hits'],
      facetPath: 'aggregations',
      productPath: 'hits.hits',
      totalPath: 'hits.total.value',
    },
    extractProducts: (body) => ((body.hits && body.hits.hits) || []).map((h) => normalizeApiProduct(h, 'opensearch')).filter(Boolean),
    extractFacets: (body) => {
      const aggs = body.aggregations || {};
      return Object.entries(aggs).map(([name, agg]) => {
        const buckets = agg.buckets || [];
        return normalizeApiFacet({ name, buckets }, 'opensearch');
      }).filter(Boolean);
    },
  },
  {
    id: 'coveo',
    name: 'Coveo',
    category: 'search',
    urlPatterns: [/cloud\.coveo\.com/i, /\/rest\/search/i, /platform\.cloud\.coveo/i],
    domainPatterns: ['cloud.coveo.com', 'platform.cloud.coveo.com'],
    responseSignals: {
      required: ['results'],
      facetPath: 'facets',
      productPath: 'results',
      totalPath: 'totalCount',
    },
    extractProducts: (body) => (body.results || []).map((r) => normalizeApiProduct(r, 'coveo')).filter(Boolean),
    extractFacets: (body) => (body.facets || []).map((f) => normalizeApiFacet(f, 'coveo')).filter(Boolean),
  },
  {
    id: 'lucidworks_fusion',
    name: 'Lucidworks Fusion',
    category: 'search',
    urlPatterns: [/\/api\/apps\/[^/]+\/query/i, /\/api\/query-pipeline/i, /fusion/i],
    domainPatterns: [],
    responseSignals: {
      required: ['response.docs'],
      facetPath: 'facet_counts',
      productPath: 'response.docs',
      totalPath: 'response.numFound',
    },
    extractProducts: (body) => {
      const docs = getPath(body, 'response.docs') || [];
      return docs.map((d) => normalizeApiProduct(d, 'lucidworks_fusion')).filter(Boolean);
    },
    extractFacets: (body) => {
      const fields = getPath(body, 'facet_counts.facet_fields') || {};
      return Object.entries(fields).map(([k, v]) => normalizeApiFacet([k, v], 'solr')).filter(Boolean);
    },
  },
  {
    id: 'solr',
    name: 'Apache Solr',
    category: 'search',
    urlPatterns: [/\/solr\/[^/]+\/select/i, /\/solr\//i],
    domainPatterns: [],
    responseSignals: {
      required: ['response.docs'],
      facetPath: 'facet_counts',
      productPath: 'response.docs',
      totalPath: 'response.numFound',
    },
    extractProducts: (body) => {
      const docs = getPath(body, 'response.docs') || [];
      return docs.map((d) => normalizeApiProduct(d, 'solr')).filter(Boolean);
    },
    extractFacets: (body) => {
      const fields = getPath(body, 'facet_counts.facet_fields') || {};
      return Object.entries(fields).map(([k, v]) => normalizeApiFacet([k, v], 'solr')).filter(Boolean);
    },
  },
  {
    id: 'bloomreach',
    name: 'Bloomreach',
    category: 'search',
    urlPatterns: [/exponea\.com/i, /bloomreach\.com/i, /brxsearch/i, /\/brx\//i],
    domainPatterns: ['exponea.com', 'bloomreach.com'],
    responseSignals: {
      required: ['response.docs'],
      facetPath: 'facet_counts',
      productPath: 'response.docs',
      totalPath: 'response.numFound',
    },
    extractProducts: (body) => {
      const docs = getPath(body, 'response.docs') || [];
      return docs.map((d) => normalizeApiProduct(d, 'bloomreach')).filter(Boolean);
    },
    extractFacets: (body) => {
      const fields = getPath(body, 'facet_counts.facet_fields') || {};
      return Object.entries(fields).map(([k, v]) => normalizeApiFacet([k, v], 'bloomreach')).filter(Boolean);
    },
  },
  {
    id: 'searchspring',
    name: 'SearchSpring',
    category: 'search',
    urlPatterns: [/api\.searchspring\.net/i, /searchspring/i],
    domainPatterns: ['api.searchspring.net'],
    responseSignals: {
      required: ['results'],
      facetPath: 'facets',
      productPath: 'results',
      totalPath: 'pagination.totalResults',
    },
    extractProducts: (body) => (body.results || []).map((r) => normalizeApiProduct(r, 'searchspring')).filter(Boolean),
    extractFacets: (body) => (body.facets || []).map((f) => normalizeApiFacet(f, 'searchspring')).filter(Boolean),
  },
  {
    id: 'klevu',
    name: 'Klevu',
    category: 'search',
    urlPatterns: [/ksearchnet\.com/i, /klevu\.com/i],
    domainPatterns: ['ksearchnet.com', 'klevu.com'],
    responseSignals: {
      required: ['queryResults'],
      productPath: 'queryResults[0].records',
      totalPath: 'queryResults[0].meta.totalResultsFound',
    },
    extractProducts: (body) => {
      const records = getPath(body, 'queryResults[0].records') || body.records || [];
      return records.map((r) => normalizeApiProduct(r, 'klevu')).filter(Boolean);
    },
    extractFacets: (body) => {
      const filters = getPath(body, 'queryResults[0].filters') || body.filters || [];
      return filters.map((f) => normalizeApiFacet(f, 'klevu')).filter(Boolean);
    },
  },
  {
    id: 'constructor_io',
    name: 'Constructor.io',
    category: 'search',
    urlPatterns: [/ac\.cnstrc\.com/i, /constructor\.io/i],
    domainPatterns: ['ac.cnstrc.com', 'constructor.io'],
    responseSignals: {
      required: ['response.results'],
      facetPath: 'response.facets',
      productPath: 'response.results',
      totalPath: 'response.total_num_results',
    },
    extractProducts: (body) => {
      const results = getPath(body, 'response.results') || body.results || [];
      return results.map((r) => normalizeApiProduct(r, 'constructor_io')).filter(Boolean);
    },
    extractFacets: (body) => {
      const facets = getPath(body, 'response.facets') || [];
      return facets.map((f) => normalizeApiFacet(f, 'constructor_io')).filter(Boolean);
    },
  },
  {
    id: 'hawksearch',
    name: 'Hawksearch',
    category: 'search',
    urlPatterns: [/searchapi\.hawksearch\.com/i, /hawksearch/i],
    domainPatterns: ['searchapi.hawksearch.com'],
    responseSignals: {
      required: ['Results'],
      facetPath: 'Facets',
      productPath: 'Results',
      totalPath: 'Pagination.TotalResults',
    },
    extractProducts: (body) => (body.Results || []).map((r) => normalizeApiProduct(r, 'hawksearch')).filter(Boolean),
    extractFacets: (body) => (body.Facets || []).map((f) => normalizeApiFacet(f, 'hawksearch')).filter(Boolean),
  },
  {
    id: 'attraqt',
    name: 'Attraqt (Fredhopper)',
    category: 'search',
    urlPatterns: [/fredhopper\.com/i, /attraqt\.com/i],
    domainPatterns: ['fredhopper.com', 'attraqt.com'],
    responseSignals: {
      required: ['universe'],
      productPath: 'universe.item',
      totalPath: 'universe.total-items',
    },
    extractProducts: (body) => {
      const items = getPath(body, 'universe.item') || [];
      return items.map((r) => normalizeApiProduct(r, 'attraqt')).filter(Boolean);
    },
    extractFacets: (body) => {
      const filters = getPath(body, 'universe.facet') || [];
      return filters.map((f) => normalizeApiFacet(f, 'attraqt')).filter(Boolean);
    },
  },
  {
    id: 'unbxd',
    name: 'Unbxd',
    category: 'search',
    urlPatterns: [/search\.unbxd\.io/i, /unbxd\.com/i],
    domainPatterns: ['search.unbxd.io'],
    responseSignals: {
      required: ['response.products'],
      facetPath: 'facets',
      productPath: 'response.products',
      totalPath: 'response.numberOfProducts',
    },
    extractProducts: (body) => {
      const prods = getPath(body, 'response.products') || [];
      return prods.map((p) => normalizeApiProduct(p, 'unbxd')).filter(Boolean);
    },
    extractFacets: (body) => (body.facets || []).map((f) => normalizeApiFacet(f, 'unbxd')).filter(Boolean),
  },
  {
    id: 'yext',
    name: 'Yext',
    category: 'search',
    urlPatterns: [/cdn\.yextapis\.com/i, /yextapis\.com/i, /yext\.com\/search/i],
    domainPatterns: ['cdn.yextapis.com', 'yextapis.com'],
    responseSignals: {
      required: ['response.results'],
      productPath: 'response.results',
      totalPath: 'response.resultsCount',
    },
    extractProducts: (body) => {
      const results = getPath(body, 'response.results') || [];
      return results.map((r) => normalizeApiProduct(r, 'yext')).filter(Boolean);
    },
    extractFacets: (body) => {
      const facets = getPath(body, 'response.facets') || [];
      return facets.map((f) => normalizeApiFacet(f, 'yext')).filter(Boolean);
    },
  },

  // ── Google APIs ────────────────────────────────────────────────────────────
  {
    id: 'google_retail',
    name: 'Google Cloud Retail',
    category: 'commerce',
    urlPatterns: [/retail\.googleapis\.com/i],
    domainPatterns: ['retail.googleapis.com'],
    responseSignals: {
      required: ['results'],
      productPath: 'results',
      totalPath: 'totalSize',
    },
    extractProducts: (body) => (body.results || []).map((r) => normalizeApiProduct(r, 'google_retail')).filter(Boolean),
    extractFacets: (body) => (body.facets || []).map((f) => normalizeApiFacet(f, 'google_retail')).filter(Boolean),
  },
  {
    id: 'google_recommendations',
    name: 'Google Recommendations AI',
    category: 'commerce',
    urlPatterns: [/recommendationengine\.googleapis\.com/i],
    domainPatterns: ['recommendationengine.googleapis.com'],
    responseSignals: {
      required: ['results'],
      productPath: 'results',
      totalPath: null,
    },
    extractProducts: (body) => (body.results || []).map((r) => normalizeApiProduct(r.product || r, 'google_retail')).filter(Boolean),
    extractFacets: () => [],
  },
  {
    id: 'google_custom_search',
    name: 'Google Custom Search',
    category: 'search',
    urlPatterns: [/www\.googleapis\.com\/customsearch/i],
    domainPatterns: ['www.googleapis.com'],
    responseSignals: {
      required: ['items'],
      productPath: 'items',
      totalPath: 'searchInformation.totalResults',
    },
    extractProducts: (body) => (body.items || []).map((item) => normalizeApiProduct({
      title: item.title,
      description: item.snippet,
      imageSrc: item.pagemap?.cse_image?.[0]?.src,
    }, 'default')).filter(Boolean),
    extractFacets: () => [],
  },
  {
    id: 'firebase_firestore',
    name: 'Firebase Firestore',
    category: 'commerce',
    urlPatterns: [/firestore\.googleapis\.com/i],
    domainPatterns: ['firestore.googleapis.com'],
    responseSignals: {
      required: ['documents'],
      productPath: 'documents',
      totalPath: null,
    },
    extractProducts: (body) => {
      const docs = body.documents || [];
      return docs.map((doc) => {
        const fields = doc.fields || {};
        const extractField = (f) => f?.stringValue ?? f?.integerValue ?? f?.doubleValue ?? null;
        return normalizeApiProduct({
          title: extractField(fields.name || fields.title),
          price: extractField(fields.price),
          id: doc.name?.split('/').pop(),
        }, 'default');
      }).filter(Boolean);
    },
    extractFacets: () => [],
  },
  {
    id: 'google_shopping',
    name: 'Google Shopping',
    category: 'commerce',
    urlPatterns: [/www\.googleapis\.com\/shopping/i, /shoppingcontent\.googleapis\.com/i],
    domainPatterns: ['www.googleapis.com', 'shoppingcontent.googleapis.com'],
    responseSignals: {
      required: ['items'],
      productPath: 'items',
      totalPath: 'totalItems',
    },
    extractProducts: (body) => (body.items || []).map((item) => normalizeApiProduct({
      title: item.product?.title || item.title,
      price: item.product?.price?.value || item.price,
      brand: item.product?.brand,
      imageSrc: item.product?.imageLink,
      sku: item.product?.offerId || item.id,
    }, 'default')).filter(Boolean),
    extractFacets: () => [],
  },

  // ── Commerce platforms ─────────────────────────────────────────────────────
  {
    id: 'sfcc',
    name: 'Salesforce Commerce Cloud',
    category: 'commerce',
    urlPatterns: [/demandware\.net/i, /commercecloud\.salesforce\.com/i, /\/dw\/shop\//i],
    domainPatterns: ['demandware.net', 'commercecloud.salesforce.com'],
    responseSignals: {
      required: ['hits'],
      facetPath: 'refinements',
      productPath: 'hits',
      totalPath: 'total',
    },
    extractProducts: (body) => (body.hits || []).map((h) => normalizeApiProduct(h.product || h, 'sfcc')).filter(Boolean),
    extractFacets: (body) => (body.refinements || []).map((r) => normalizeApiFacet(r, 'sfcc')).filter(Boolean),
  },
  {
    id: 'sap_hybris',
    name: 'SAP Commerce (Hybris)',
    category: 'commerce',
    urlPatterns: [/\/rest\/v2\/[^/]+\/products\/search/i, /\/occ\/v2\//i],
    domainPatterns: [],
    responseSignals: {
      required: ['products'],
      facetPath: 'facets',
      productPath: 'products',
      totalPath: 'pagination.totalResults',
    },
    extractProducts: (body) => (body.products || []).map((p) => normalizeApiProduct(p, 'sap_hybris')).filter(Boolean),
    extractFacets: (body) => (body.facets || []).map((f) => normalizeApiFacet(f, 'sap_hybris')).filter(Boolean),
  },
  {
    id: 'commercetools',
    name: 'commercetools',
    category: 'commerce',
    urlPatterns: [/api\.commercetools\.com/i, /commercetools\.com\/api/i],
    domainPatterns: ['api.commercetools.com'],
    responseSignals: {
      required: ['results'],
      productPath: 'results',
      totalPath: 'total',
    },
    extractProducts: (body) => {
      const results = body.results || (body.data && (body.data.products?.results || body.data.productProjectionSearch?.results)) || [];
      return results.map((p) => normalizeApiProduct(p, 'commercetools')).filter(Boolean);
    },
    extractFacets: (body) => {
      const facets = body.facets || (body.data && body.data.productProjectionSearch?.facets) || [];
      if (Array.isArray(facets)) return facets.map((f) => normalizeApiFacet(f, 'commercetools')).filter(Boolean);
      return Object.entries(facets).map(([name, f]) => normalizeApiFacet({ name, ...f }, 'commercetools')).filter(Boolean);
    },
  },
  {
    id: 'magento',
    name: 'Magento / Adobe Commerce',
    category: 'commerce',
    urlPatterns: [/\/rest\/V1\/products/i, /\/graphql.*aggregations/i, /\/rest\/default\/V1\//i],
    domainPatterns: [],
    responseSignals: {
      required: ['items'],
      facetPath: 'aggregations',
      productPath: 'items',
      totalPath: 'total_count',
    },
    extractProducts: (body) => {
      const items = body.items || (body.data && body.data.products?.items) || [];
      return items.map((p) => normalizeApiProduct(p, 'magento')).filter(Boolean);
    },
    extractFacets: (body) => {
      const aggs = body.aggregations || (body.data && body.data.products?.aggregations) || [];
      return aggs.map((a) => normalizeApiFacet({
        name: a.label || a.attribute_code,
        values: (a.options || []).map((o) => ({ label: o.label, value: o.value, count: o.count })),
      }, 'default')).filter(Boolean);
    },
  },
  {
    id: 'shopify',
    name: 'Shopify',
    category: 'commerce',
    urlPatterns: [/cdn\.shopify\.com/i, /\/search\/suggest\.json/i, /\/products\.json/i, /myshopify\.com/i],
    domainPatterns: ['cdn.shopify.com', 'myshopify.com'],
    responseSignals: {
      required: ['products'],
      facetPath: 'filters',
      productPath: 'products',
      totalPath: null,
    },
    extractProducts: (body) => {
      const prods = body.products || (body.results && body.results.products) || [];
      return prods.map((p) => normalizeApiProduct(p, 'shopify')).filter(Boolean);
    },
    extractFacets: (body) => {
      const filters = body.filters || [];
      return filters.map((f) => normalizeApiFacet(f, 'shopify')).filter(Boolean);
    },
  },
  {
    id: 'vtex',
    name: 'VTEX',
    category: 'commerce',
    urlPatterns: [/vtexcommercestable\.com\.br/i, /vteximg\.com\.br/i, /vtex\.com/i],
    domainPatterns: ['vtexcommercestable.com.br', 'vtex.com'],
    responseSignals: {
      required: ['Data'],
      productPath: 'Data',
      totalPath: 'RecordsFiltered',
    },
    extractProducts: (body) => {
      const prods = body.Data || body.data || body.products || body;
      if (Array.isArray(prods)) return prods.map((p) => normalizeApiProduct(p, 'default')).filter(Boolean);
      return [];
    },
    extractFacets: (body) => {
      const facets = body.Facets || body.facets || [];
      return facets.map((f) => normalizeApiFacet(f, 'default')).filter(Boolean);
    },
  },
  {
    id: 'bigcommerce',
    name: 'BigCommerce',
    category: 'commerce',
    urlPatterns: [/bigcommerce\.com\/api/i, /\/api\/v3\/catalog/i, /bigcommerce\.com/i],
    domainPatterns: ['bigcommerce.com'],
    responseSignals: {
      required: ['data'],
      productPath: 'data',
      totalPath: 'meta.pagination.total',
    },
    extractProducts: (body) => {
      const prods = body.data || [];
      if (Array.isArray(prods)) return prods.map((p) => normalizeApiProduct(p, 'default')).filter(Boolean);
      return [];
    },
    extractFacets: () => [],
  },

  // ── Review platforms ───────────────────────────────────────────────────────
  {
    id: 'bazaarvoice',
    name: 'Bazaarvoice',
    category: 'reviews',
    urlPatterns: [/api\.bazaarvoice\.com/i, /bazaarvoice\.com/i],
    domainPatterns: ['api.bazaarvoice.com'],
    responseSignals: {
      required: ['Results'],
      productPath: 'Results',
      totalPath: 'TotalResults',
    },
    extractProducts: (body) => (body.Results || []).map((r) => normalizeApiProduct(r, 'bazaarvoice')).filter(Boolean),
    extractFacets: () => [],
  },
  {
    id: 'powerreviews',
    name: 'PowerReviews',
    category: 'reviews',
    urlPatterns: [/api\.powerreviews\.com/i, /powerreviews\.com/i],
    domainPatterns: ['api.powerreviews.com'],
    responseSignals: {
      required: ['results'],
      productPath: 'results',
      totalPath: null,
    },
    extractProducts: (body) => (body.results || []).map((r) => normalizeApiProduct(r, 'powerreviews')).filter(Boolean),
    extractFacets: () => [],
  },
  {
    id: 'yotpo',
    name: 'Yotpo',
    category: 'reviews',
    urlPatterns: [/api\.yotpo\.com/i, /yotpo\.com/i],
    domainPatterns: ['api.yotpo.com'],
    responseSignals: {
      required: ['response'],
      productPath: 'response.reviews',
      totalPath: 'response.bottomline.total_review',
    },
    extractProducts: (body) => [normalizeApiProduct(body, 'yotpo')].filter(Boolean),
    extractFacets: () => [],
  },
  {
    id: 'okendo',
    name: 'Okendo',
    category: 'reviews',
    urlPatterns: [/api\.okendo\.io/i, /okendo\.io/i],
    domainPatterns: ['api.okendo.io'],
    responseSignals: {
      required: ['reviewAggregate'],
      productPath: 'reviews',
      totalPath: 'reviewAggregate.reviewCount',
    },
    extractProducts: (body) => (body.reviews || []).map((r) => normalizeApiProduct(r, 'default')).filter(Boolean),
    extractFacets: () => [],
  },
  {
    id: 'stamped',
    name: 'Stamped.io',
    category: 'reviews',
    urlPatterns: [/stamped\.io/i, /api\.stamped\.io/i],
    domainPatterns: ['stamped.io', 'api.stamped.io'],
    responseSignals: {
      required: ['data'],
      productPath: 'data',
      totalPath: 'total',
    },
    extractProducts: (body) => (body.data || []).map((r) => normalizeApiProduct(r, 'default')).filter(Boolean),
    extractFacets: () => [],
  },
  {
    id: 'trustpilot',
    name: 'Trustpilot',
    category: 'reviews',
    urlPatterns: [/api\.trustpilot\.com/i, /trustpilot\.com/i],
    domainPatterns: ['api.trustpilot.com'],
    responseSignals: {
      required: ['reviews'],
      productPath: 'reviews',
      totalPath: 'paging.total',
    },
    extractProducts: (body) => (body.reviews || []).map((r) => normalizeApiProduct(r, 'default')).filter(Boolean),
    extractFacets: () => [],
  },

  // ── GTM / Analytics ────────────────────────────────────────────────────────
  {
    id: 'google_analytics',
    name: 'Google Analytics',
    category: 'analytics',
    urlPatterns: [/google-analytics\.com/i, /analytics\.google\.com/i, /gtag/i],
    domainPatterns: ['google-analytics.com', 'analytics.google.com'],
    responseSignals: {
      required: null,
      productPath: null,
      totalPath: null,
    },
    extractProducts: () => [],
    extractFacets: () => [],
  },
  {
    id: 'segment',
    name: 'Segment',
    category: 'analytics',
    urlPatterns: [/api\.segment\.io/i, /segment\.io/i, /cdn\.segment\.com/i],
    domainPatterns: ['api.segment.io', 'cdn.segment.com'],
    responseSignals: {
      required: null,
      productPath: 'properties.products',
      totalPath: null,
    },
    extractProducts: (body) => {
      const prods = getPath(body, 'properties.products') || [];
      return prods.map((p) => normalizeApiProduct(p, 'default')).filter(Boolean);
    },
    extractFacets: () => [],
  },
  {
    id: 'mparticle',
    name: 'mParticle',
    category: 'analytics',
    urlPatterns: [/mparticle\.com/i, /jssdks\.mparticle\.com/i],
    domainPatterns: ['mparticle.com', 'jssdks.mparticle.com'],
    responseSignals: {
      required: null,
      productPath: null,
      totalPath: null,
    },
    extractProducts: () => [],
    extractFacets: () => [],
  },
  {
    id: 'adobe_analytics',
    name: 'Adobe Analytics',
    category: 'analytics',
    urlPatterns: [/omtrdc\.net/i, /sc\.omtrdc\.net/i, /adobe\.com\/analytics/i],
    domainPatterns: ['omtrdc.net', 'sc.omtrdc.net'],
    responseSignals: {
      required: null,
      productPath: null,
      totalPath: null,
    },
    extractProducts: () => [],
    extractFacets: () => [],
  },
];

/**
 * Generic facet extractor for responses that don't match a known platform.
 * Tries common facet array shapes: { name, options[] }, { label, values[] },
 * Solr facet_fields, Elasticsearch aggregations, etc.
 */
function extractGenericFacets(body) {
  if (!body || typeof body !== 'object') return [];

  // Try common root keys that hold facet arrays
  const candidates = [
    body.facets, body.Facets, body.filters, body.refinements,
    body.facetGroups, body.filterGroups,
  ];
  for (const arr of candidates) {
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const first = arr[0];
    if (!first || typeof first !== 'object') continue;
    const hasName = first.name || first.label || first.displayName || first.title;
    const opts = first.options || first.values || first.buckets || first.items || first.children;
    if (hasName && Array.isArray(opts)) {
      return arr.map((f) => {
        const name = f.name || f.label || f.displayName || f.title || 'Unknown';
        const options = (f.options || f.values || f.buckets || f.items || f.children || [])
          .map((o) => ({
            label: String(o.label || o.name || o.value || o.displayName || o.text || '').trim(),
            count: o.count || o.doc_count || o.productCount || null,
            selected: o.selected || o.isSelected || false,
          }))
          .filter((o) => o.label);
        return options.length > 0 ? { name, type: 'list', options } : null;
      }).filter(Boolean);
    }
  }

  // Solr facet_fields: { fieldName: [val, count, val, count, ...] }
  const solrFields = body.facet_counts?.facet_fields;
  if (solrFields && typeof solrFields === 'object' && !Array.isArray(solrFields)) {
    return Object.entries(solrFields)
      .map(([name, arr]) => {
        if (!Array.isArray(arr) || arr.length < 2) return null;
        const options = [];
        for (let i = 0; i < arr.length - 1; i += 2) {
          const label = String(arr[i]).trim();
          const count = typeof arr[i + 1] === 'number' ? arr[i + 1] : null;
          if (label) options.push({ label, count, selected: false });
        }
        return options.length > 0 ? { name, type: 'list', options } : null;
      })
      .filter(Boolean);
  }

  // Elasticsearch aggregations: { aggName: { buckets: [{ key, doc_count }] } }
  const aggs = body.aggregations;
  if (aggs && typeof aggs === 'object' && !Array.isArray(aggs)) {
    const facets = Object.entries(aggs)
      .map(([name, agg]) => {
        const buckets = agg?.buckets;
        if (!Array.isArray(buckets) || buckets.length === 0) return null;
        const options = buckets
          .map((b) => ({ label: String(b.key || b.key_as_string || '').trim(), count: b.doc_count || null, selected: false }))
          .filter((o) => o.label);
        return options.length > 0 ? { name, type: 'list', options } : null;
      })
      .filter(Boolean);
    if (facets.length > 0) return facets;
  }

  return [];
}

// ─── Scoring algorithm ────────────────────────────────────────────────────────

/**
 * Score a network response for "product data richness" — returns 0-100.
 */
export function scoreResponse(response) {
  if (!response || !response.body || typeof response.body !== 'object') return 0;

  let score = 0;
  const body = response.body;

  // Find the first array of 10+ items in the response
  const findLargeArray = (obj, depth = 0) => {
    if (depth > 4) return null;
    if (Array.isArray(obj) && obj.length >= 10) return obj;
    if (obj && typeof obj === 'object') {
      for (const v of Object.values(obj)) {
        const found = findLargeArray(v, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };

  const largeArray = findLargeArray(body);
  if (largeArray) {
    score += 20;

    // Sample the first item to look for product signals
    const sample = largeArray[0];
    if (sample && typeof sample === 'object') {
      const keys = Object.keys(sample).join(' ').toLowerCase();
      const vals = JSON.stringify(sample).toLowerCase();

      // Price-like fields
      if (/price|cost|amount|usd|eur|gbp|msrp|sale/.test(keys)) score += 20;

      // Title/name-like fields
      if (/title|name|product_name|displayname|productname/.test(keys)) score += 20;

      // Price values in text
      if (/\$|\d+\.\d{2}/.test(vals)) score += 5;
    }
  }

  // Pagination info
  const bodyStr = JSON.stringify(body).toLowerCase();
  if (/total|totalresults|nbhits|numfound|totalcount|recordsfiltered/.test(bodyStr)) score += 15;

  // Facet/filter structure — keyword presence
  if (/facets?|aggregations?|refinements?|filters?/.test(bodyStr)) score += 15;

  // Structural bonus: response contains an actual array of facet-shaped objects
  // (name/label + options/values/buckets/items as an array) — platform-agnostic
  const hasFacetStructure = (() => {
    const candidates = [
      body.facets, body.Facets, body.filters, body.refinements,
      body.facetGroups, body.aggregations,
      body.facet_counts?.facet_fields,
    ];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length > 0) {
        const s = c[0];
        if (s && typeof s === 'object') {
          const hasName = s.name || s.label || s.displayName || s.title;
          const hasOpts = Array.isArray(s.options || s.values || s.buckets || s.items || s.children);
          if (hasName && hasOpts) return true;
        }
      }
      // Solr facet_fields: object of arrays
      if (c && !Array.isArray(c) && typeof c === 'object') {
        const vals = Object.values(c);
        if (vals.length > 0 && Array.isArray(vals[0])) return true;
      }
    }
    return false;
  })();
  if (hasFacetStructure) score += 20;

  // Size bonus (>5KB)
  if (response.size > 5120) score += 10;

  // Penalize auth-gated responses
  if (response.hadAuthHeader) score -= 20;

  // Penalize non-200 responses
  if (response.status !== 200) score -= 10;

  return Math.max(0, Math.min(100, score));
}

// ─── Network interception ─────────────────────────────────────────────────────

/**
 * Set up Puppeteer response interception on a page object.
 * MUST be called BEFORE page.goto().
 * Stores collected responses on page._networkResponses.
 */
export async function interceptNetworkRequests(page) {
  page._networkResponses = [];
  const requestStartTimes = new Map();

  // Track request start times
  page.on('request', (req) => {
    requestStartTimes.set(req.url(), Date.now());
  });

  page.on('response', async (response) => {
    try {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';

      // Only collect JSON responses
      if (!contentType.includes('application/json') && !contentType.includes('text/json')) return;

      const status = response.status();
      const requestHeaders = response.request().headers() || {};
      const hadAuthHeader = !!(requestHeaders['authorization'] || requestHeaders['x-api-key']);

      const startTime = requestStartTimes.get(url) || Date.now();
      const duration = Date.now() - startTime;

      let body = null;
      let size = 0;
      try {
        const text = await response.text();
        size = Buffer.byteLength(text, 'utf8');
        body = JSON.parse(text);
      } catch {
        // Not valid JSON or failed to read — skip
        return;
      }

      page._networkResponses.push({
        url,
        method: response.request().method(),
        status,
        contentType,
        body,
        size,
        duration,
        requestHeaders,
        hadAuthHeader,
      });
    } catch {
      // Non-fatal — ignore response parsing failures
    }
  });
}

// ─── Platform fingerprint matching ───────────────────────────────────────────

/**
 * Test whether a response matches a platform fingerprint.
 */
function matchesPlatform(response, fingerprint) {
  // URL pattern match
  const urlMatches = fingerprint.urlPatterns.some((pattern) => pattern.test(response.url));
  if (!urlMatches && fingerprint.urlPatterns.length > 0) {
    // Also check domain patterns
    const domainMatch = fingerprint.domainPatterns.some((d) => response.url.toLowerCase().includes(d.toLowerCase()));
    if (!domainMatch) return false;
  }

  // Required response signals
  if (fingerprint.responseSignals?.required && fingerprint.responseSignals.required.length > 0) {
    const allPresent = fingerprint.responseSignals.required.every((path) => {
      return getPath(response.body, path) != null;
    });
    if (!allPresent) return false;
  }

  return true;
}

// ─── Analyze collected responses ──────────────────────────────────────────────

/**
 * Analyze the collected network responses and classify them.
 */
export function analyzeNetworkResponses(responses) {
  const result = {
    platforms: [],
    productApis: [],
    facetApis: [],
    reviewApis: [],
    dataLayerApis: [],
    unknownApis: [],
  };

  if (!Array.isArray(responses) || responses.length === 0) return result;

  const detectedPlatformIds = new Set();

  for (const response of responses) {
    if (!response.body || typeof response.body !== 'object') continue;

    let matched = false;

    for (const fingerprint of PLATFORM_FINGERPRINTS) {
      if (matchesPlatform(response, fingerprint)) {
        matched = true;

        if (!detectedPlatformIds.has(fingerprint.id)) {
          detectedPlatformIds.add(fingerprint.id);
          result.platforms.push({
            id: fingerprint.id,
            name: fingerprint.name,
            category: fingerprint.category,
            detectedAt: response.url,
          });
        }

        // Classify response by platform category
        const entry = { ...response, platform: fingerprint.id, score: scoreResponse(response) };

        if (fingerprint.category === 'reviews') {
          result.reviewApis.push(entry);
        } else if (fingerprint.category === 'analytics') {
          result.dataLayerApis.push(entry);
        } else {
          // Check for product and facet data
          const productPath = fingerprint.responseSignals?.productPath;
          const facetPath = fingerprint.responseSignals?.facetPath;

          if (productPath && getPath(response.body, productPath) != null) {
            result.productApis.push({ ...entry, fingerprint });
          }
          if (facetPath && getPath(response.body, facetPath) != null) {
            result.facetApis.push({ ...entry, fingerprint });
          }
        }

        break; // First matching fingerprint wins
      }
    }

    // If no fingerprint matched, score for potential product data
    if (!matched) {
      const score = scoreResponse(response);
      if (score >= 30) {
        result.unknownApis.push({ ...response, score });
      }

      // Generic facet extraction: if the body has recognizable facet structure,
      // add to facetApis with a generic extractor so DOM fallback isn't needed
      if (score >= 30) {
        const genericFacets = extractGenericFacets(response.body);
        if (genericFacets.length > 0) {
          const genericFingerprint = {
            id: 'generic',
            extractFacets: () => genericFacets,
          };
          result.facetApis.push({ ...response, score, platform: 'generic', fingerprint: genericFingerprint });
        }
      }
    }
  }

  // Sort product APIs by score descending
  result.productApis.sort((a, b) => b.score - a.score);

  return result;
}

// ─── Extract from best API ────────────────────────────────────────────────────

/**
 * Given the analysis result and pageType, pick the best API response and extract
 * normalized products and facets.
 * Returns null if no high-confidence extraction is possible.
 */
export function extractFromBestApi(analyzed, pageType = 'plp') {
  if (!analyzed) return null;

  // Pick the best product API by score
  const bestProductApi = analyzed.productApis[0] || null;

  if (!bestProductApi || !bestProductApi.fingerprint) return null;

  const { fingerprint, body } = bestProductApi;

  let products = [];
  let facets = [];
  let totalCount = null;

  try {
    products = fingerprint.extractProducts(body);
  } catch {
    products = [];
  }

  // Look for matching facet API (same platform preferred)
  const bestFacetApi = analyzed.facetApis.find((f) => f.platform === fingerprint.id)
    || analyzed.facetApis[0]
    || null;

  if (bestFacetApi && bestFacetApi.fingerprint) {
    try {
      facets = bestFacetApi.fingerprint.extractFacets(bestFacetApi.body);
    } catch {
      facets = [];
    }
  } else if (fingerprint.extractFacets) {
    try {
      facets = fingerprint.extractFacets(body);
    } catch {
      facets = [];
    }
  }

  // Extract total count
  const totalPath = fingerprint.responseSignals?.totalPath;
  if (totalPath) {
    const raw = getPath(body, totalPath);
    if (raw != null) totalCount = parseInt(raw, 10) || null;
  }

  // Compute confidence
  let confidence = bestProductApi.score || 0;
  if (products.length > 0) confidence = Math.min(100, confidence + 20);
  if (facets.length > 0) confidence = Math.min(100, confidence + 10);

  if (products.length === 0) return null;

  return {
    source: fingerprint.id,
    products: products.filter((p) => p && p.title),
    facets: facets.filter(Boolean),
    totalCount,
    confidence,
  };
}

// ─── DataLayer / digitalData parser ──────────────────────────────────────────

/**
 * Evaluate in-page JS to extract all dataLayer and digitalData content.
 * Must be called on an active Puppeteer page object.
 */
export async function parseDataLayers(page) {
  try {
    return await page.evaluate(() => {
      // ── dataLayer parsing ─────────────────────────────────────────────────
      const rawDataLayer = window.dataLayer || [];
      const ecommerceEvents = [];
      const allProducts = [];
      const allCategories = [];
      let userSegment = null;
      const experiments = [];
      let pageType = null;
      let analyticsPlatform = null;
      const gtmContainers = [];
      const gaProperties = [];

      // Scan all scripts for GTM container IDs and GA4 IDs
      try {
        document.querySelectorAll('script').forEach((s) => {
          const src = s.src || '';
          const text = s.textContent || '';
          const combined = src + text;

          // GTM container IDs
          const gtmMatches = combined.matchAll(/GTM-[A-Z0-9]+/g);
          for (const m of gtmMatches) {
            if (!gtmContainers.includes(m[0])) gtmContainers.push(m[0]);
          }

          // GA4 measurement IDs
          const gaMatches = combined.matchAll(/G-[A-Z0-9]+/g);
          for (const m of gaMatches) {
            if (!gaProperties.includes(m[0])) gaProperties.push(m[0]);
          }
        });
      } catch { /* non-fatal */ }

      // Detect analytics platform from window objects
      if (window.dataLayer) analyticsPlatform = 'gtm';
      if (window.gtag) analyticsPlatform = 'ga4';
      if (window._satellite) analyticsPlatform = 'adobe_launch';
      if (window.utag) analyticsPlatform = 'tealium';
      if (window.analytics && window.analytics.track) analyticsPlatform = 'segment';

      // GA4 ecommerce event names
      const GA4_ECOMMERCE_EVENTS = new Set([
        'view_item_list', 'view_item', 'select_item', 'add_to_cart',
        'remove_from_cart', 'view_cart', 'begin_checkout', 'add_payment_info',
        'add_shipping_info', 'purchase', 'refund', 'add_to_wishlist',
        'view_promotion', 'select_promotion', 'view_search_results',
      ]);

      const seenProductIds = new Set();

      for (const event of rawDataLayer) {
        if (!event || typeof event !== 'object') continue;

        // Detect page type
        if (event.pageType && !pageType) pageType = String(event.pageType);
        if (event.page_type && !pageType) pageType = String(event.page_type);
        if (event.pagetype && !pageType) pageType = String(event.pagetype);

        // User segment
        if (!userSegment) {
          userSegment = event.userType || event.user_type || event.customerType
            || event.customer_type || event.userSegment || null;
        }

        // A/B experiments
        if (event.experiments || event.experimentList || event.ab_tests) {
          const exps = event.experiments || event.experimentList || event.ab_tests || [];
          if (Array.isArray(exps)) experiments.push(...exps);
        }

        // Check for ecommerce events (GA4 style)
        const eventName = event.event;
        if (eventName && GA4_ECOMMERCE_EVENTS.has(eventName)) {
          const ecom = event.ecommerce || {};
          const items = ecom.items || ecom.products || ecom.impressions || [];

          const eventEntry = {
            event: eventName,
            currency: ecom.currency || null,
            value: ecom.value || ecom.revenue || null,
            products: [],
          };

          for (const item of (Array.isArray(items) ? items : [])) {
            const product = {
              id: item.item_id || item.id || item.product_id || null,
              name: item.item_name || item.name || item.productName || null,
              brand: item.item_brand || item.brand || null,
              category: item.item_category || item.category || null,
              price: item.price != null ? parseFloat(item.price) : null,
              quantity: item.quantity != null ? parseInt(item.quantity, 10) : null,
              variant: item.item_variant || item.variant || null,
              listName: item.item_list_name || item.list || null,
              position: item.index || item.position || null,
            };

            eventEntry.products.push(product);

            // Deduplicate into allProducts
            const pid = product.id || product.name;
            if (pid && !seenProductIds.has(pid)) {
              seenProductIds.add(pid);
              allProducts.push(product);
            }

            if (product.category && !allCategories.includes(product.category)) {
              allCategories.push(product.category);
            }
          }

          ecommerceEvents.push(eventEntry);
        }

        // UA / legacy GA ecommerce (impressions, detail, checkout)
        if (event.ecommerce) {
          const ecom = event.ecommerce;
          const legacyImpressions = ecom.impressions || ecom.detail?.products || ecom.checkout?.products || [];
          for (const item of (Array.isArray(legacyImpressions) ? legacyImpressions : [])) {
            const pid = item.id || item.name;
            if (pid && !seenProductIds.has(pid)) {
              seenProductIds.add(pid);
              allProducts.push({
                id: item.id || null,
                name: item.name || null,
                brand: item.brand || null,
                category: item.category || null,
                price: item.price != null ? parseFloat(item.price) : null,
                quantity: item.quantity || null,
                variant: item.variant || null,
                listName: item.list || null,
                position: item.position || null,
              });
            }
          }
        }
      }

      // ── digitalData (W3C CEDDL) ────────────────────────────────────────────
      const dd = window.digitalData || null;
      let ddPage = null;
      let ddProduct = null;
      let ddCart = null;
      let ddUser = null;
      const ddEvents = [];

      if (dd) {
        ddPage = dd.page || null;
        ddProduct = dd.product || null;
        ddCart = dd.cart || null;
        ddUser = dd.user || null;
        ddEvents.push(...(dd.events || []));
      }

      // ── Summary ────────────────────────────────────────────────────────────
      const platforms = [];
      if (analyticsPlatform) platforms.push(analyticsPlatform);
      if (window._satellite) platforms.push('adobe_launch');
      if (window.utag_data) platforms.push('tealium');
      if (gtmContainers.length > 0 && !platforms.includes('gtm') && !platforms.includes('ga4')) platforms.push('gtm');

      // Safely serialize to avoid circular reference issues
      const safeSerialize = (obj, depth = 0) => {
        if (depth > 5) return '[nested]';
        if (obj == null) return obj;
        if (typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.slice(0, 100).map((item) => safeSerialize(item, depth + 1));
        const result = {};
        let keyCount = 0;
        for (const [k, v] of Object.entries(obj)) {
          if (keyCount++ > 50) break;
          try { result[k] = safeSerialize(v, depth + 1); } catch { result[k] = '[error]'; }
        }
        return result;
      };

      return {
        dataLayer: {
          raw: rawDataLayer.slice(0, 50).map((e) => safeSerialize(e)),
          ecommerceEvents,
          products: allProducts,
          categories: allCategories,
          userSegment: userSegment ? String(userSegment) : null,
          experiments: experiments.slice(0, 20),
          pageType,
          platform: analyticsPlatform,
        },
        digitalData: {
          raw: dd ? safeSerialize(dd) : null,
          page: ddPage ? safeSerialize(ddPage) : null,
          product: ddProduct ? safeSerialize(ddProduct) : null,
          cart: ddCart ? safeSerialize(ddCart) : null,
          user: ddUser ? safeSerialize(ddUser) : null,
          events: ddEvents.slice(0, 20),
        },
        gtmContainers,
        gaProperties,
        summary: {
          totalProductImpressions: allProducts.length,
          hasEcommerceTracking: ecommerceEvents.length > 0,
          hasUserData: !!(ddUser || userSegment),
          platforms,
        },
      };
    });
  } catch (err) {
    // Non-fatal — return empty structure
    return {
      dataLayer: {
        raw: [], ecommerceEvents: [], products: [], categories: [],
        userSegment: null, experiments: [], pageType: null, platform: null,
      },
      digitalData: { raw: null, page: null, product: null, cart: null, user: null, events: [] },
      gtmContainers: [],
      gaProperties: [],
      summary: { totalProductImpressions: 0, hasEcommerceTracking: false, hasUserData: false, platforms: [] },
    };
  }
}

/**
 * Scrub a URL to a stable base pattern by removing session tokens,
 * user IDs, and highly dynamic query parameters.
 * Used when persisting discovered API endpoints to site memory.
 */
export function scrubEndpointPattern(url) {
  try {
    const parsed = new URL(url);

    // Dynamic query param keys to strip
    const DYNAMIC_PARAMS = new Set([
      'token', 'access_token', 'api_key', 'apikey', 'key', 'auth',
      'session', 'sessionid', 'session_id', 'sid', 'uid', 'user_id',
      'userid', 'timestamp', 'ts', 'nonce', 'rand', 'random', '_t', 't',
      'cb', 'callback', 'v', 'version', 'ref', 'referrer',
    ]);

    const cleanParams = new URLSearchParams();
    for (const [k, v] of parsed.searchParams.entries()) {
      if (!DYNAMIC_PARAMS.has(k.toLowerCase())) {
        // Scrub value if it looks like a UUID or long token
        const scrubbed = /^[a-f0-9-]{20,}$/i.test(v) ? '[id]' : v.slice(0, 50);
        cleanParams.set(k, scrubbed);
      }
    }

    parsed.search = cleanParams.toString();
    // Strip hashes
    parsed.hash = '';

    return parsed.toString();
  } catch {
    return url;
  }
}
