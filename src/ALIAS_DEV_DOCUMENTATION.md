
logo
API Reference
Authentication
Versioning
Pagination
Errors
Request IDs
Test
Test
Catalog
SearchCatalog
GetCatalogItem
Pricing Insights
ListAvailabilities
GetAvailability
GetOfferHistogram
ListRecentSales
Listing Management
SearchListing
CreateListing
DeleteListing
GetListing
UpdateListing
ActivateListing
DeactivateListing
CreateListingMetadata
DeleteListingMetadata
CreatePicture
DeletePicture
Order Management
SearchOrders
GetOrder
CancelOrder
ConfirmOrder
GenerateLabel
RegenerateLabel
ShipOrder
Batch Listing Management
ListBatches
GetBatch
BatchActivateListings
BatchCreateListings
BatchDeactivateListings
BatchDeleteListings
GetBatchOperationQuota
GetBatchOperations
BatchUpdateListings
Docs
Support
alias OpenAPI
API Reference
Whether you're a seasoned developer or just starting out, this reference can help you build applications that integrate with the marketplace.

The alias OpenAPI specification is designed to adhere to the RESTful principles of predictable resource oriented URLs. It also uses standard HTTP response codes and verbs while encoding all responses in JSON. For each endpoint, you’ll find:
Detailed descriptions that explain how each API works
Code samples that show how to use the APIs in different programming languages
Troubleshooting tips that can help you resolve common problems


Authentication
Every request to this API must be authenticated using bearer authentication and authorized using personal access tokens. This means that you must include a valid bearer token in the Authorization header of your request and the token must be one that you have been granted access to through the token manager.
Bearer Authentication
Bearer authentication is a method of granting access to an API using a token called a bearer token. The bearer token is a short string that is issued to a user or application after they have successfully authenticated. The bearer token is then used to make requests to the API, and the server will complete the request if the bearer token is valid. To use bearer authentication, you will need to create a bearer token and then send it to the API in the Authorization header of your request as shown on the right.
Personal Access Tokens
Personal access tokens (PATs) are a type of bearer token that can be used to grant access to an API to an application. PATs are issued to a specific user and application, and they do not need to be refreshed. This makes them ideal for applications that need to access our API frequently. To create a PAT, you will need to go to the token manager page. You will be asked to provide a name for the PAT and select the scopes that the PAT will have access to. Once you have created the PAT, you will be able to view it in the dashboard. To use a PAT, you will need to include it in the Authorization header of your request. The format of the Authorization header is shown on the right.

Authenticated Request
const BEARER_TOKEN = 'mytoken_84cf6c5c734d4c88';

fetch('https://api.alias.org/api/v1/test', {
  headers: {Authorization: `Bearer ${BEARER_TOKEN}`}
})
  .then(resp => resp.json())
  .then(json => console.log(JSON.stringify(json)));
Versioning
Current: v1.3.4

The API follows Semantic Versioning. This means that each release will have a version number in the form MAJOR.MINOR.PATCH. We can expect breaking changes during the beta stage of the API.
Major Version
The major version number is incremented when there is a major change to the API. This could be a change in the underlying data model, a change in the way the API works, or a change in the way the API is accessed.
Minor Version
The minor version number is incremented when there is a backwards-compatible change to the API. This could be a new feature, a bug fix, or a minor change to the way the API works.
Patch Version
The patch version number is incremented when there is a backwards-compatible bug fix.
Changes
The API will be updated on a regular basis. The following are some of the changes that may be made:
New Features
Bug fixes
Minor changes to the way the API works

Pagination
Many top-level API resources contain "list" and "search" versions to be used for reading large data sets. Often times, these list versions of the resource cannot be queried in a single request, and need to be paged over to obtain the entire set. For instance, you can search catalog items in an effort to create listings or analyze pricing insights. These list API methods share a common structure, taking at least two pagination control parameters: limit and paginationToken.

The response of a paged API method represents a single page in an order determined by the specific resource and can be determined by consulting that APIs reference. If you do not specify a paginationToken, you will receive the first pafe of the dataset. You can specify paginationToken equal to the returned paginationToken of the first page of the queried dataset. This implies that you cannot "skip ahead" of pages or send concurrent requests to receive the entire dataset at once, so please use the appropriate query control parameters ( such as filters and facets ) of your specified resource to concentrate your queried dataset to only relevant information.

If a given page is not the last page in the dataset, the response will contain a hasMore boolean field value of True, and a paginationToken to be used in a subsequent paged request. Please note that most "list" and "search" requests enforce rate limits, so it is advised to record persistent IDs for re-use in other API operations.

Request
const PATH = 'search'; // My API Path
const LIMIT = 50; // My results limit
const PAGINATION_TOKEN = '857f6e1f-f01e-4c88-b00d-84cf6c5c734d'; // Pagination token received from previous call
const BEARER_TOKEN = 'mytoken_84cf6c5c734d4c88';

fetch(`https://api.alias.org/api/v1/${PATH}?query=${QUERY}&limit=${LIMIT}&paginationToken=${PAGINATION_TOKEN}`, {
  headers: {Authorization: `Bearer ${BEARER_TOKEN}`}
})
  .then(resp => resp.json())
  .then(json => console.log(JSON.stringify(json)));
Response
{
  "items": [
    //...
  ],
  "nextPaginationToken": "string",
  "hasMore": true
}
Errors
alias OpenAPI uses conventional HTTP response codes to indicate the success or failure of an API request. In general: Codes in the 2xx range indicate success. Codes in the 4xx range indicate an error that failed given the information provided (e.g., a required parameter was omitted, a resource cannot be found, another process is modifying the resource, etc.). Codes in the 5xx range indicate an error with our servers.

4xx errors that can be handled programmatically include an error code that briefly explains the error reported, as well as a generally helpful error message. It is recommended to handle these errors based off of the error code returned, and not the error message. Error messages can change between versions and may be translated based off of language preferences, but error codes will remain consistent between versions.

HTTP Status Code Summary
200 - OK
Everything worked as expected.
400 - Bad Request
The request was unacceptable, often due to missing a required parameter or malformed request
401 - Unauthorized
No valid API key provided.
402 - Request Failed
The parameters were valid but the request failed.
403 - Forbidden
The PAT token doesn't have permissions to perform the request.
404 - Not Found
The requested resource doesn't exist.
409 - Conflict
The request conflicts with another request or process. This generally happens when you are attempting to modify a resource already being modified by another process.
429 - Too Many Requests
Too many requests hit the API too quickly. If you require a higher rate limit to support your use cases, please reach out to support detailing your request.
500, 502, 503, 504 - Server Errors
Something is wrong with our servers, please try again later or contact support
Request IDs
Request IDs are universally unique IDs that can be used to identify a request. We often use these IDs to help resolve any issues and to track the historical status and resolution of a request. Request IDs can be retrieved from the standard x-request-id response header returned after each request.

If you file a support ticket or reach out our support email, please include any relevant request IDs to help us facilitate a prompt and accurate response to your question or issue.

Print request ID
const PATH = 'search'; // My API Path
const BEARER_TOKEN = 'mytoken_84cf6c5c734d4c88';

fetch(`https://api.alias.org/api/v1/{PATH}?query={QUERY}&limit={LIMIT}&paginationToken={PAGINATION_TOKEN}`, {
  headers: {Authorization: `Bearer ${BEARER_TOKEN}`}
})
  .then(resp => resp.headers.get('x-request-id'))
  .then(console.log);
Test


GET
/api/v1/test
Test
This is a test endpoint that is meant to confirm that your token is valid. Use this endpoint to confirm the validity of your token and whether your requests are formatted correctly.

Parameters
No parameters

Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "ok": true
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}
Catalog


GET
/api/v1/catalog
Search Catalog
Search the catalog for items that are relevant to you, or to match any catalog ids returned to your inventory.

Parameters
Name	Description
query *
string
(query)
The term to search. Examples terms: 'Nike', 'Air Max Plus 'Baltic Blue', '555088 063'.

query
limit
string($int64)
(query)
The size of the 'page' returned. The default value is the maximum limit.

limit
pagination_token
string
(query)
Pass the next pagination token received from a subsequent request. If not provided, the default will be the first page in the set.

pagination_token
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "catalog_items": [
    {
      "catalog_id": "air-jordan-5-retro-grape-2025-hq7978-100",
      "name": "Air Jordan 5 Retro 'Grape' 2025",
      "sku": "HQ7978 100",
      "brand": "Air Jordan",
      "gender": "men",
      "release_date": "2025-06-21",
      "product_category_v2": "shoes",
      "product_type": "sneakers",
      "size_unit": "SIZE_UNIT_US",
      "allowed_sizes": [
        {
          "display_name": "7",
          "value": 7,
          "us_size_equivalent": 7
        },
        {
          "display_name": "7.5",
          "value": 7.5,
          "us_size_equivalent": 7.5
        }
      ],
      "minimum_listing_price_cents": 2500,
      "maximum_listing_price_cents": 200000,
      "main_picture_url": "https://image.goat.com/glow-4-5-25/750/attachments/product_template_pictures/images/111/347/682/original/1556310_00.png.png",
      "retail_price_cents": 21000,
      "colorway": "White/New Emerald/Grape Ice/Black",
      "nickname": "Grape",
      "requires_listing_pictures": false,
      "resellable": true,
      "requested_pictures": [
        {
          "type": "PICTURE_TYPE_OUTER",
          "quantity": 1
        },
        {
          "type": "PICTURE_TYPE_EXTRA",
          "quantity": 3
        }
      ]
    }
  ],
  "next_pagination_token": "some_token",
  "has_more": true
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

GET
/api/v1/catalog/{id}
Get Catalog Item
Get the attributes for a single catalog item with the provided catalog id. If that catalog id cannot be found, this endpoint will return a 404 error code.

Parameters
Name	Description
id *
string
(path)
The unique id that identifies the product in our catalog. You can search items in our catalog by using the SearchCatalog endpoint.

id
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "catalog_item": {
    "catalog_id": "air-jordan-5-retro-grape-2025-hq7978-100",
    "name": "Air Jordan 5 Retro 'Grape' 2025",
    "sku": "HQ7978 100",
    "brand": "Air Jordan",
    "gender": "men",
    "release_date": "2025-06-21",
    "product_category_v2": "shoes",
    "product_type": "sneakers",
    "size_unit": "SIZE_UNIT_US",
    "allowed_sizes": [
      {
        "display_name": "7",
        "value": 7,
        "us_size_equivalent": 7
      },
      {
        "display_name": "7.5",
        "value": 7.5,
        "us_size_equivalent": 7.5
      }
    ],
    "minimum_listing_price_cents": 2500,
    "maximum_listing_price_cents": 200000,
    "main_picture_url": "https://image.goat.com/glow-4-5-25/750/attachments/product_template_pictures/images/111/347/682/original/1556310_00.png.png",
    "retail_price_cents": 21000,
    "colorway": "White/New Emerald/Grape Ice/Black",
    "nickname": "Grape",
    "requires_listing_pictures": false,
    "resellable": true,
    "requested_pictures": [
      {
        "type": "PICTURE_TYPE_OUTER",
        "quantity": 1
      },
      {
        "type": "PICTURE_TYPE_EXTRA",
        "quantity": 3
      }
    ]
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}
Pricing Insights


GET
/api/v1/pricing_insights/availabilities/{catalog_id}
List Pricing Insights
Gets comprehensive marketplace data for the provided catalog ID, across all sizes and conditions. Unlike GetAvailability which returns data for a specific variation, this endpoint returns pricing information for all available variations of an item. The response includes multiple variants organized by size, condition, and packaging, with each variant containing its own availability data. This endpoint is useful for comparing pricing across different product variations.

Parameters
Name	Description
catalog_id *
string
(path)
The unique ID that identifies the item in our catalog. You can search for catalog IDs by using the SearchCatalog endpoint.

catalog_id
region_id
string
(query)
The region given. Empty values represent all regions (global).

region_id
consigned
boolean
(query)
Whether the item is consigned or not. When this field is not provided, pricing insights will include both consigned and unconsigned items.

Select...
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "variants": [
    {
      "size": 0,
      "product_condition": "PRODUCT_CONDITION_INVALID",
      "packaging_condition": "PACKAGING_CONDITION_INVALID",
      "consigned": true,
      "availability": {
        "lowest_listing_price_cents": "string",
        "highest_offer_price_cents": "string",
        "last_sold_listing_price_cents": "string",
        "global_indicator_price_cents": "string"
      }
    }
  ]
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

GET
/api/v1/pricing_insights/availability
Get Pricing Insights
Gets current marketplace pricing data for the provided catalog ID, including lowest listing price, highest offer price, last sold price, and global indicator price. You can use this endpoint to help gauge the market going rate for a specific product variation and make informed pricing decisions. The global indicator price represents a competitive price point that accounts for regional differences and market dynamics.

Parameters
Name	Description
catalog_id *
string
(query)
The unique ID that identifies the item in our catalog. You can search for catalog IDs by using the SearchCatalog endpoint.

catalog_id
size *
number($double)
(query)
The US size. Please refer to the size key for all supported sizes and their non-US equivalents.

size
product_condition *
string
(query)
The requested product condition.

PRODUCT_CONDITION_NEW: Item is brand new with no defects
PRODUCT_CONDITION_USED: Item has been previously used or worn
PRODUCT_CONDITION_NEW_WITH_DEFECTS: Item is unused but contains a factory defect or imperfection
Available values : PRODUCT_CONDITION_INVALID, PRODUCT_CONDITION_NEW, PRODUCT_CONDITION_USED, PRODUCT_CONDITION_NEW_WITH_DEFECTS

Default value : PRODUCT_CONDITION_INVALID

Select...
packaging_condition *
string
(query)
The requested packaging condition.

PACKAGING_CONDITION_GOOD_CONDITION: Original packaging in excellent condition with minimal wear
PACKAGING_CONDITION_MISSING_LID: Original packaging with lid missing from the box
PACKAGING_CONDITION_BADLY_DAMAGED: Original packaging with significant damage or defects
PACKAGING_CONDITION_NO_ORIGINAL_BOX: Item does not include its original packaging
Available values : PACKAGING_CONDITION_INVALID, PACKAGING_CONDITION_GOOD_CONDITION, PACKAGING_CONDITION_MISSING_LID, PACKAGING_CONDITION_BADLY_DAMAGED, PACKAGING_CONDITION_NO_ORIGINAL_BOX

Default value : PACKAGING_CONDITION_INVALID

Select...
consigned
boolean
(query)
Whether the item is consigned or not. When this field is not provided, pricing insights will include both consigned and unconsigned items.

Select...
region_id
string
(query)
The region given. Not providing this parameter will return values across all selling regions.

region_id
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "availability": {
    "lowest_listing_price_cents": "string",
    "highest_offer_price_cents": "string",
    "last_sold_listing_price_cents": "string",
    "global_indicator_price_cents": "string"
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

GET
/api/v1/pricing_insights/offer_histogram
Get Offer Price Distribution
Gets the offer spread for a given catalog ID, filterable by the provided parameters. The response contains histogram bins that represent price points and the count of offers at each price point, sorted from highest to lowest price. Bins are dynamically generated based on the current market data. You can use this endpoint to determine the depth and breadth of the spread of offers for a given item.

Parameters
Name	Description
catalog_id *
string
(query)
The unique ID that identifies the item in our catalog. You can search for catalog IDs by using the SearchCatalog endpoint.

catalog_id
size *
number($double)
(query)
The US size. Please refer to the size key for all supported sizes and their non-US equivalents.

size
product_condition *
string
(query)
The requested product condition.

PRODUCT_CONDITION_NEW: Item is brand new with no defects
PRODUCT_CONDITION_USED: Item has been previously used or worn
PRODUCT_CONDITION_NEW_WITH_DEFECTS: Item is unused but contains a factory defect or imperfection
Available values : PRODUCT_CONDITION_INVALID, PRODUCT_CONDITION_NEW, PRODUCT_CONDITION_USED, PRODUCT_CONDITION_NEW_WITH_DEFECTS

Default value : PRODUCT_CONDITION_INVALID

Select...
packaging_condition *
string
(query)
The requested packaging condition.

PACKAGING_CONDITION_GOOD_CONDITION: Original packaging in excellent condition with minimal wear
PACKAGING_CONDITION_MISSING_LID: Original packaging with lid missing from the box
PACKAGING_CONDITION_BADLY_DAMAGED: Original packaging with significant damage or defects
PACKAGING_CONDITION_NO_ORIGINAL_BOX: Item does not include its original packaging
Available values : PACKAGING_CONDITION_INVALID, PACKAGING_CONDITION_GOOD_CONDITION, PACKAGING_CONDITION_MISSING_LID, PACKAGING_CONDITION_BADLY_DAMAGED, PACKAGING_CONDITION_NO_ORIGINAL_BOX

Default value : PACKAGING_CONDITION_INVALID

Select...
region_id
string
(query)
The region given. Not providing this parameter will return values for all regions ( global ).

region_id
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "offer_histogram": {
    "bins": [
      {
        "offer_price_cents": "string",
        "count": "string"
      }
    ]
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

GET
/api/v1/pricing_insights/recent_sales
View Sales History
Lists the recent sales of a given catalog ID. Results are ordered chronologically with the most recent sales first. You can use this endpoint to determine historical pricing trends.

Supports two access patterns:
(1) Catalog Item Sales: Filter by catalog_id (required), region_id (optional), and consigned (must be non-null). Use this pattern to analyze overall sales trends for a catalog item.
(2) Single Variant Sales: Filter by catalog_id (required), size (required), product_condition (required), packaging_condition (required), consigned (optional), and region_id (optional). Use this pattern for detailed analysis of sales trends on a specific variant.

Default limit is 10 results. When using pattern #2 with all filters, up to 200 results can be requested. These limits are subject to change.

Parameters
Name	Description
catalog_id *
string
(query)
The unique ID that identifies the item in our catalog. You can search for catalog IDs by using the SearchCatalog endpoint.

catalog_id
size
number($double)
(query)
The US size. Please refer to the size key for all supported sizes and their non-US equivalents. If not provided, the endpoint will return sales across all sizes.

size
limit
string($int64)
(query)
Maximum number of sold products to return. Defaults to 10 if not specified. Maximum allowed value is 200 when all filter parameters are provided, otherwise limited to 10. These limits may change in future updates.

limit
product_condition
string
(query)
An enum describing the condition of the sold product.

PRODUCT_CONDITION_NEW: Item is brand new with no defects
PRODUCT_CONDITION_USED: Item has been previously used or worn
PRODUCT_CONDITION_NEW_WITH_DEFECTS: Item is unused but contains a factory defect or imperfection
Available values : PRODUCT_CONDITION_INVALID, PRODUCT_CONDITION_NEW, PRODUCT_CONDITION_USED, PRODUCT_CONDITION_NEW_WITH_DEFECTS

Default value : PRODUCT_CONDITION_INVALID

Select...
packaging_condition
string
(query)
An enum describing the packaging of the sold product.

PACKAGING_CONDITION_GOOD_CONDITION: Original packaging in excellent condition with minimal wear
PACKAGING_CONDITION_MISSING_LID: Original packaging with lid missing from the box
PACKAGING_CONDITION_BADLY_DAMAGED: Original packaging with significant damage or defects
PACKAGING_CONDITION_NO_ORIGINAL_BOX: Item does not include its original packaging
Available values : PACKAGING_CONDITION_INVALID, PACKAGING_CONDITION_GOOD_CONDITION, PACKAGING_CONDITION_MISSING_LID, PACKAGING_CONDITION_BADLY_DAMAGED, PACKAGING_CONDITION_NO_ORIGINAL_BOX

Default value : PACKAGING_CONDITION_INVALID

Select...
consigned
boolean
(query)
A boolean indicating whether the product was sold as consigned.

Select...
region_id
string
(query)
The region in which the products were sold. Defaults to global if none specified.

region_id
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "recent_sales": [
    {
      "purchased_at": "2025-12-22T18:30:06.028Z",
      "price_cents": "string",
      "size": 0,
      "consigned": true,
      "catalog_id": "string"
    }
  ]
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}
Listing Management


GET
/api/v1/listings
Search Listings
Search listings by criteria.

Parameters
Name	Description
search_term
string
(query)
The search term to search listings. You can search by catalog SKU, name, ID. Example: 'Air Jordan 1' or 'DZ5485-612'

search_term
facet_filters
array[string]
(query)
Filters for faceted search. Supported filter formats:

Status: "status: active"
Consignment: "consigned: true"
Metadata: "metadata: key = value"
Examples:

JSON: ["status: active", "consigned: true"]
Query parameters: ?facet_filters=status:active&facet_filters=consigned:false
Query parameters: ?facet_filters=metadata:ext_tag=123
numeric_filters
array[string]
(query)
Numeric range and equality filters. Supported filter formats:

Price: "price_cents >= 1000", "price_cents <= 99000"
Size: "size = 7.5"
Examples:

JSON: ["price_cents >= 1000"]
Query parameters: ?numeric_filters=price_cents<10000&numeric_filters=size=7.5
page_size
string($int64)
(query)
The maximum number of values returned in the search. Values returned may be less depending on page size. Default: 25, Maximum: 50

page_size
pagination_token
string
(query)
Pass the next pagination token received from a subsequent request. If not provided, the default will be the first page in the set.

pagination_token
order.sort_by
string
(query)
SEARCH_LISTING_REQUEST_ORDER_SORT_BY_SIZE: Sort listings by product size
SEARCH_LISTING_REQUEST_ORDER_SORT_BY_PRICE: Sort listings by price
SEARCH_LISTING_REQUEST_ORDER_SORT_BY_UPDATED_AT: Sort listings by when they were last updated
SEARCH_LISTING_REQUEST_ORDER_SORT_BY_CREATED_AT: Sort listings by when they were created
Available values : SEARCH_LISTING_REQUEST_ORDER_SORT_BY_INVALID, SEARCH_LISTING_REQUEST_ORDER_SORT_BY_SIZE, SEARCH_LISTING_REQUEST_ORDER_SORT_BY_PRICE, SEARCH_LISTING_REQUEST_ORDER_SORT_BY_UPDATED_AT, SEARCH_LISTING_REQUEST_ORDER_SORT_BY_CREATED_AT

Default value : SEARCH_LISTING_REQUEST_ORDER_SORT_BY_INVALID

Select...
order.order_by
string
(query)
SEARCH_LISTING_REQUEST_ORDER_ORDER_BY_ASC: Order listings in ascending order
SEARCH_LISTING_REQUEST_ORDER_ORDER_BY_DESC: Order listings in descending order
Available values : SEARCH_LISTING_REQUEST_ORDER_ORDER_BY_INVALID, SEARCH_LISTING_REQUEST_ORDER_ORDER_BY_ASC, SEARCH_LISTING_REQUEST_ORDER_ORDER_BY_DESC

Default value : SEARCH_LISTING_REQUEST_ORDER_ORDER_BY_INVALID

Select...
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "listings": [
    {
      "id": "string",
      "catalog_id": "string",
      "condition": "CONDITION_INVALID",
      "packaging_condition": "PACKAGING_CONDITION_INVALID",
      "size": 0,
      "size_unit": "SIZE_UNIT_INVALID",
      "sku": "string",
      "consigned": true,
      "created_at": "2025-12-22T18:30:06.030Z",
      "updated_at": "2025-12-22T18:30:06.030Z",
      "status": "LISTING_STATUS_INVALID",
      "price_cents": "string",
      "activated_at": "2025-12-22T18:30:06.030Z",
      "metadata": {},
      "defects": [
        "LISTING_DEFECT_INVALID"
      ],
      "additional_defects": "string"
    }
  ],
  "pagination": {
    "pagination_token": "string",
    "has_more": true,
    "total_count": "string"
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

POST
/api/v1/listings
Create Listing
Create a single listing.

Parameters
Name	Description
catalog_id *
string
(query)
The catalog item ID that listing associated to.

catalog_id
price_cents *
string($int64)
(query)
The price cents of the product in USD. Price must be in whole dollar increments.

price_cents
condition *
string
(query)
The condition of the listing.

CONDITION_NEW: Item is brand new with no defects
CONDITION_USED: Item has been previously used or worn
CONDITION_NEW_WITH_DEFECTS: Item is unused but contains a factory defect or imperfection
Available values : CONDITION_INVALID, CONDITION_NEW, CONDITION_USED, CONDITION_NEW_WITH_DEFECTS

Default value : CONDITION_INVALID

Select...
packaging_condition *
string
(query)
An enum describing the packaging of the product.

PACKAGING_CONDITION_GOOD_CONDITION: Original packaging in excellent condition with minimal wear
PACKAGING_CONDITION_MISSING_LID: Original packaging with lid missing from the box
PACKAGING_CONDITION_BADLY_DAMAGED: Original packaging with significant damage or defects
PACKAGING_CONDITION_NO_ORIGINAL_BOX: Item does not include its original packaging
Available values : PACKAGING_CONDITION_INVALID, PACKAGING_CONDITION_GOOD_CONDITION, PACKAGING_CONDITION_MISSING_LID, PACKAGING_CONDITION_BADLY_DAMAGED, PACKAGING_CONDITION_NO_ORIGINAL_BOX

Default value : PACKAGING_CONDITION_INVALID

Select...
size *
number($float)
(query)
The size value of the listing. Please refer to the size key for all supported sizes.

size
size_unit *
string
(query)
The size unit of the listing.

SIZE_UNIT_US: United States sizing standard
SIZE_UNIT_UK: United Kingdom sizing standard
SIZE_UNIT_IT: Italian sizing standard
SIZE_UNIT_FR: French sizing standard
SIZE_UNIT_EU: European sizing standard
SIZE_UNIT_JP: Japanese sizing standard
Available values : SIZE_UNIT_INVALID, SIZE_UNIT_US, SIZE_UNIT_UK, SIZE_UNIT_IT, SIZE_UNIT_FR, SIZE_UNIT_EU, SIZE_UNIT_JP

Default value : SIZE_UNIT_INVALID

Select...
activate
boolean
(query)
When set to true, the system will try to activate the listing immediately. When set to false or left empty, the listing will remain in a pending state. Important: For listings that require pictures, all mandatory pictures must be uploaded before activation can succeed. If a picture-required listing fails to activate due to missing pictures, it will be set to inactive status.

Select...
metadata
object
(query)
Metadata to associate to the listing, can be used for further identification and searching.

{}
defects
array[string]
(query)
Enumerated defects of the listing.

LISTING_DEFECT_HAS_ODOR: Product has noticeable odor
LISTING_DEFECT_HAS_DISCOLORATION: Product has visible discoloration
LISTING_DEFECT_HAS_MISSING_INSOLES: Product has missing insoles
LISTING_DEFECT_HAS_SCUFFS: Product has scuffs
LISTING_DEFECT_HAS_TEARS: Product has tears
LISTING_DEFECT_B_GRADE: Product is B-grade
Available values : LISTING_DEFECT_INVALID, LISTING_DEFECT_HAS_ODOR, LISTING_DEFECT_HAS_DISCOLORATION, LISTING_DEFECT_HAS_MISSING_INSOLES, LISTING_DEFECT_HAS_SCUFFS, LISTING_DEFECT_HAS_TEARS, LISTING_DEFECT_B_GRADE

Select...
additional_defects
string
(query)
Additional text description of defects of the listing. These should be limited to specific conditional issues of the listing.

additional_defects
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "listing": {
    "id": "listing_1234567890",
    "catalog_id": "air-jordan-5-retro-grape-2025-hq7978-100",
    "price_cents": 25000,
    "condition": "CONDITION_NEW",
    "packaging_condition": "PACKAGING_CONDITION_GOOD_CONDITION",
    "size": 7.5,
    "size_unit": "SIZE_UNIT_US",
    "status": "LISTING_STATUS_ACTIVE",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

DELETE
/api/v1/listings/{id}
Delete Listing
Delete a listing.

Parameters
Name	Description
id *
string
(path)
The unique id of the listing to delete.

id
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "id": "string"
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

GET
/api/v1/listings/{id}
Get Listing
Get a single listing.

Parameters
Name	Description
id *
string
(path)
The unique ID of the listing to get.

id
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "listing": {
    "id": "string",
    "catalog_id": "string",
    "condition": "CONDITION_INVALID",
    "packaging_condition": "PACKAGING_CONDITION_INVALID",
    "size": 0,
    "size_unit": "SIZE_UNIT_INVALID",
    "sku": "string",
    "consigned": true,
    "created_at": "2025-12-22T18:30:06.034Z",
    "updated_at": "2025-12-22T18:30:06.034Z",
    "status": "LISTING_STATUS_INVALID",
    "price_cents": "string",
    "activated_at": "2025-12-22T18:30:06.034Z",
    "metadata": {},
    "defects": [
      "LISTING_DEFECT_INVALID"
    ],
    "additional_defects": "string"
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

POST
/api/v1/listings/{id}
Update Listing
Update a single listing.

Parameters
Name	Description
id *
string
(path)
The unique ID of the listing to update.

id
catalog_id
string
(query)
The catalog item ID that listing associated to update. Provide this parameter to update the field.

catalog_id
price_cents
string($int64)
(query)
The price cents of the product in USD to update. Price must be in whole dollar increments.

price_cents
size
number($float)
(query)
The size value of the listing to update. Provide this parameter to update the field. Please refer to the size key for all supported sizes.

size
size_unit
string
(query)
The size unit of the listing.

SIZE_UNIT_US: United States sizing standard
SIZE_UNIT_UK: United Kingdom sizing standard
SIZE_UNIT_IT: Italian sizing standard
SIZE_UNIT_FR: French sizing standard
SIZE_UNIT_EU: European sizing standard
SIZE_UNIT_JP: Japanese sizing standard
Available values : SIZE_UNIT_INVALID, SIZE_UNIT_US, SIZE_UNIT_UK, SIZE_UNIT_IT, SIZE_UNIT_FR, SIZE_UNIT_EU, SIZE_UNIT_JP

Default value : SIZE_UNIT_INVALID

Select...
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "listing": {
    "id": "string",
    "catalog_id": "string",
    "condition": "CONDITION_INVALID",
    "packaging_condition": "PACKAGING_CONDITION_INVALID",
    "size": 0,
    "size_unit": "SIZE_UNIT_INVALID",
    "sku": "string",
    "consigned": true,
    "created_at": "2025-12-22T18:30:06.035Z",
    "updated_at": "2025-12-22T18:30:06.035Z",
    "status": "LISTING_STATUS_INVALID",
    "price_cents": "string",
    "activated_at": "2025-12-22T18:30:06.035Z",
    "metadata": {},
    "defects": [
      "LISTING_DEFECT_INVALID"
    ],
    "additional_defects": "string"
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

POST
/api/v1/listings/{id}/activate
Activate Listing
Activate a created listing.

Parameters
Name	Description
id *
string
(path)
The unique id of the listing to activate. Note: if the listing requires pictures, all required pictures must be uploaded for activation to succeed.

id
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "listing": {
    "id": "string",
    "catalog_id": "string",
    "condition": "CONDITION_INVALID",
    "packaging_condition": "PACKAGING_CONDITION_INVALID",
    "size": 0,
    "size_unit": "SIZE_UNIT_INVALID",
    "sku": "string",
    "consigned": true,
    "created_at": "2025-12-22T18:30:06.036Z",
    "updated_at": "2025-12-22T18:30:06.036Z",
    "status": "LISTING_STATUS_INVALID",
    "price_cents": "string",
    "activated_at": "2025-12-22T18:30:06.036Z",
    "metadata": {},
    "defects": [
      "LISTING_DEFECT_INVALID"
    ],
    "additional_defects": "string"
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

POST
/api/v1/listings/{id}/deactivate
Deactivate Listing
deactivate a created listing.

Parameters
Name	Description
id *
string
(path)
The unique id of the listing to deactivate.

id
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "listing": {
    "id": "string",
    "catalog_id": "string",
    "condition": "CONDITION_INVALID",
    "packaging_condition": "PACKAGING_CONDITION_INVALID",
    "size": 0,
    "size_unit": "SIZE_UNIT_INVALID",
    "sku": "string",
    "consigned": true,
    "created_at": "2025-12-22T18:30:06.036Z",
    "updated_at": "2025-12-22T18:30:06.036Z",
    "status": "LISTING_STATUS_INVALID",
    "price_cents": "string",
    "activated_at": "2025-12-22T18:30:06.036Z",
    "metadata": {},
    "defects": [
      "LISTING_DEFECT_INVALID"
    ],
    "additional_defects": "string"
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

POST
/api/v1/listings/{listing_id}/metadata
Add Listing Metadata
Create metadata for a listing.

Parameters
Name	Description
listing_id *
string
(path)
The listing identifier.

listing_id
metadata *
object
(query)
The metadata to add to the associated listing.

{}
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "listing": {
    "id": "string",
    "catalog_id": "string",
    "condition": "CONDITION_INVALID",
    "packaging_condition": "PACKAGING_CONDITION_INVALID",
    "size": 0,
    "size_unit": "SIZE_UNIT_INVALID",
    "sku": "string",
    "consigned": true,
    "created_at": "2025-12-22T18:30:06.038Z",
    "updated_at": "2025-12-22T18:30:06.038Z",
    "status": "LISTING_STATUS_INVALID",
    "price_cents": "string",
    "activated_at": "2025-12-22T18:30:06.038Z",
    "metadata": {},
    "defects": [
      "LISTING_DEFECT_INVALID"
    ],
    "additional_defects": "string"
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

POST
/api/v1/listings/{listing_id}/metadata_delete
Remove Listing Metadata
Deletes metadata for a listing.

Parameters
Name	Description
listing_id *
string
(path)
The listing identifier.

listing_id
keys *
array[string]
(query)
The metadata keys to remove from the associated listing.

Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "listing": {
    "id": "string",
    "catalog_id": "string",
    "condition": "CONDITION_INVALID",
    "packaging_condition": "PACKAGING_CONDITION_INVALID",
    "size": 0,
    "size_unit": "SIZE_UNIT_INVALID",
    "sku": "string",
    "consigned": true,
    "created_at": "2025-12-22T18:30:06.039Z",
    "updated_at": "2025-12-22T18:30:06.039Z",
    "status": "LISTING_STATUS_INVALID",
    "price_cents": "string",
    "activated_at": "2025-12-22T18:30:06.039Z",
    "metadata": {},
    "defects": [
      "LISTING_DEFECT_INVALID"
    ],
    "additional_defects": "string"
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

POST
/api/v1/pictures
Add Listing Picture
Create a single picture for a listing.

IMPORTANT NOTES:
(1) Pictures must meet our quality requirements as outlined in our Photo Guidelines.
(2) Supported formats: PNG, JPEG.
(3) If your listing activation fails and reverts to 'INACTIVE' status, any non-compliant pictures will be automatically deleted.
(4) You will need to upload new, compliant pictures before attempting to reactivate the listing.
(5) For additional information, an email will be sent to your account detailing the reason for the rejection.

Parameters
Name	Description
listing_id *
string
(query)
The listing ID that picture is associated to.

listing_id
type *
string
(query)
The picture type of the picture.

PICTURE_TYPE_OUTER: Image of the product's outer appearance
PICTURE_TYPE_INNER: Image of the product's inner components
PICTURE_TYPE_UNDER: Image of the product's underside
PICTURE_TYPE_TOP: Image of the product from the top view
PICTURE_TYPE_BACK: Image of the product from the back view
PICTURE_TYPE_TAG: Image of the product's tags or labels
PICTURE_TYPE_PACKAGING: Image of the product's packaging
PICTURE_TYPE_SIZE_TAG: Image of the product's size tag
PICTURE_TYPE_INTERIOR: Image of the product's interior
PICTURE_TYPE_EXTRA: Additional images of the product
Available values : PICTURE_TYPE_PICTURE_TYPE_INVALID, PICTURE_TYPE_OUTER, PICTURE_TYPE_INNER, PICTURE_TYPE_UNDER, PICTURE_TYPE_TOP, PICTURE_TYPE_BACK, PICTURE_TYPE_TAG, PICTURE_TYPE_PACKAGING, PICTURE_TYPE_SIZE_TAG, PICTURE_TYPE_INTERIOR, PICTURE_TYPE_EXTRA

Default value : PICTURE_TYPE_PICTURE_TYPE_INVALID

Select...
order
string($int64)
(query)
The order of the picture on the associated listing in relation to other pictures of the same picture type. Required for picture type EXTRA. Must be greater than 0, not required and set to 1 for all other types.

order
base64_data
string
(query)
The data source for a picture provided as a base64-encoded string. If provided url must be blank.

base64_data
url
string
(query)
The data source for a picture provided as a file url. If provided base64_data must be blank. Supported file formats: PNG, JPG/JPEG.

url
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "picture": {
    "id": "string",
    "listing_id": "string",
    "type": "PICTURE_TYPE_PICTURE_TYPE_INVALID",
    "order": "string",
    "url": "string"
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

DELETE
/api/v1/pictures/{id}
Remove Listing Picture
Delete a single picture for a listing.

Parameters
Name	Description
id *
string
(path)
The ID of the picture.

id
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "id": "string"
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}
Order Management


GET
/api/v1/orders
Search Orders
Queries orders

Parameters
Name	Description
query
string
(query)
The full text query of the search. Example: 'Air Jordan' to search for Air Jordan products

query
facet_filters
array[string]
(query)
Filters for faceted search. Supports 'status' and 'fulfillment_status' facets, but only one facet type per request.

Supported filter formats:

Status: "status:ORDER_STATUS_CONFIRMED"
Fulfillment status: "fulfillment_status:FULFILLMENT_STATUS_DELIVERED"
Examples:

JSON: ["status:ORDER_STATUS_IN_TRANSIT"]
Query parameters: ?facet_filters=status:ORDER_STATUS_COMPLETED
Query parameters: ?facet_filters=fulfillment_status:FULFILLMENT_STATUS_DELIVERED
page_size
string($int64)
(query)
The maximum number of values returned in the search. Values returned may be less depending on page size. Default: 25, Maximum: 50

page_size
pagination_token
string
(query)
Pass the next pagination token received from a subsequent request. If not provided, the default will be the first page in the set.

pagination_token
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
      "in_transit_at": "2025-07-29T09:00:00Z",
      "updated_at": "2025-07-29T09:00:00Z",
      "cancels_at": "2025-08-04T10:30:00Z",
      "customs_declaration": {
        "commercial_invoice_url": "https://example.com/invoices/1a2b3c4d.pdf",
        "declared_customs_value_cents": 22000
      }
    },
    {
      "id": "9z8y7x6w-5v4u-3t2s-1r0q-9p8o7n6m5l4k",
      "status": "ORDER_STATUS_IN_TRANSIT",
      "fulfillment_status": "FULFILLMENT_STATUS_DELIVERED",
      "catalog_id": "adidas-yeezy-boost-350-v2-bred-cp9652",
      "catalog_name": "Adidas Yeezy Boost 350 V2 'Bred'",
      "catalog_brand": "Adidas",
      "catalog_sku": "CP9652",
      "size": 9,
      "price_cents": 25000,
      "price_cents_after_take": 22500,
      "sales_channel": "Alias",
      "purchase_order_number": "PO-654321",
      "listing_id": "l-abc-123",
      "label_type": "LABEL_TYPE_DROPOFF",
      "label_url": "https://example.com/labels/9z8y7x6w.pdf",
      "label_tracking_number": "1Z999AA101987654321",
      "label_courier": "FedEx",
      "sold_at": "2025-07-30T11:00:00Z",
      "label_generated_at": "2025-07-30T15:00:00Z",
      "in_transit_at": "2025-07-31T08:00:00Z",
      "updated_at": "2025-08-01T14:30:00Z",
      "cancels_at": "2025-08-06T11:00:00Z"
    }
  ],
  "pagination": {
    "next_page_token": "some_token"
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

GET
/api/v1/orders/{id}
Get Order Details
Get an individual order by ID

Parameters
Name	Description
id *
string
(path)
The ID of the order to retrieve

id
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "order": {
    "id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "status": "ORDER_STATUS_IN_TRANSIT",
    "fulfillment_status": "FULFILLMENT_STATUS_IN_TRANSIT",
    "catalog_id": "air-jordan-5-retro-grape-2025-hq7978-100",
    "catalog_name": "Air Jordan 5 Retro 'Grape' 2025",
    "catalog_brand": "Air Jordan",
    "catalog_sku": "HQ7978 100",
    "size": 10.5,
    "price_cents": 22000,
    "price_cents_after_take": 20000,
    "sales_channel": "GOAT",
    "purchase_order_number": "PO-123456",
    "listing_id": "l-xyz-789",
    "label_type": "LABEL_TYPE_SHIPPING",
    "label_url": "https://example.com/labels/1a2b3c4d.pdf",
    "label_tracking_number": "1Z999AA10123456789",
    "label_courier": "UPS",
    "sold_at": "2025-07-28T10:30:00Z",
    "label_generated_at": "2025-07-28T14:00:00Z",
    "in_transit_at": "2025-07-29T09:00:00Z",
    "updated_at": "2025-07-29T09:00:00Z",
    "cancels_at": "2025-08-04T10:30:00Z",
    "customs_declaration": {
      "commercial_invoice_url": "https://example.com/invoices/1a2b3c4d.pdf",
      "declared_customs_value_cents": 22000
    }
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

POST
/api/v1/orders/{id}/cancel
Cancel Order
Cancel an individual order.

Parameters
Name	Description
id *
string
(path)
The ID of the order to cancel

id
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "order": {
    "id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "status": "ORDER_STATUS_CANCELED",
    "catalog_id": "air-jordan-5-retro-grape-2025-hq7978-100",
    "catalog_name": "Air Jordan 5 Retro 'Grape' 2025",
    "catalog_brand": "Air Jordan",
    "catalog_sku": "HQ7978 100",
    "size": 10.5,
    "price_cents": 22000,
    "price_cents_after_take": 20000,
    "sales_channel": "GOAT",
    "purchase_order_number": "PO-123456",
    "listing_id": "l-xyz-789",
    "label_type": "LABEL_TYPE_SHIPPING",
    "label_url": "https://example.com/labels/1a2b3c4d.pdf",
    "label_tracking_number": "1Z999AA10123456789",
    "label_courier": "UPS",
    "sold_at": "2025-07-28T10:30:00Z",
    "label_generated_at": "2025-07-28T14:00:00Z",
    "in_transit_at": "2025-07-29T09:00:00Z",
    "updated_at": "2025-07-29T09:00:00Z",
    "cancels_at": "2025-08-04T10:30:00Z",
    "customs_declaration": {
      "commercial_invoice_url": "https://example.com/invoices/1a2b3c4d.pdf",
      "declared_customs_value_cents": 22000
    }
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

POST
/api/v1/orders/{id}/confirm
Confirm Order
Confirm an individual order. Orders need to be confirmed or they risk being canceled.

Parameters
Name	Description
id *
string
(path)
The ID of the order to confirm

id
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "order": {
    "id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "status": "ORDER_STATUS_CONFIRMED",
    "catalog_id": "air-jordan-5-retro-grape-2025-hq7978-100",
    "catalog_name": "Air Jordan 5 Retro 'Grape' 2025",
    "catalog_brand": "Air Jordan",
    "catalog_sku": "HQ7978 100",
    "size": 10.5,
    "price_cents": 22000,
    "price_cents_after_take": 20000,
    "sales_channel": "GOAT",
    "purchase_order_number": "PO-123456",
    "listing_id": "l-xyz-789",
    "label_type": "LABEL_TYPE_SHIPPING",
    "label_url": "https://example.com/labels/1a2b3c4d.pdf",
    "label_tracking_number": "1Z999AA10123456789",
    "label_courier": "UPS",
    "sold_at": "2025-07-28T10:30:00Z",
    "label_generated_at": "2025-07-28T14:00:00Z",
    "in_transit_at": "2025-07-29T09:00:00Z",
    "updated_at": "2025-07-29T09:00:00Z",
    "cancels_at": "2025-08-04T10:30:00Z",
    "customs_declaration": {
      "commercial_invoice_url": "https://example.com/invoices/1a2b3c4d.pdf",
      "declared_customs_value_cents": 22000
    }
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

POST
/api/v1/orders/{id}/generate_label
Generate Shipping Label
Generate a label for an individual order.

Parameters
Name	Description
id *
string
(path)
The ID of the order to generate a label for

id
label_type
string
(query)
The type of label to generate, defaults to shipping

LABEL_TYPE_SHIPPING: Standard shipping label for package delivery through carrier services
LABEL_TYPE_DROPOFF: Label for items that need to be dropped off at a designated location
Available values : LABEL_TYPE_INVALID, LABEL_TYPE_SHIPPING, LABEL_TYPE_DROPOFF

Default value : LABEL_TYPE_INVALID

Select...
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "order": {
    "id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "status": "ORDER_STATUS_LABEL_GENERATED",
    "catalog_id": "air-jordan-5-retro-grape-2025-hq7978-100",
    "catalog_name": "Air Jordan 5 Retro 'Grape' 2025",
    "catalog_brand": "Air Jordan",
    "catalog_sku": "HQ7978 100",
    "size": 10.5,
    "price_cents": 22000,
    "price_cents_after_take": 20000,
    "sales_channel": "GOAT",
    "purchase_order_number": "PO-123456",
    "listing_id": "l-xyz-789",
    "label_type": "LABEL_TYPE_SHIPPING",
    "label_url": "https://example.com/labels/1a2b3c4d.pdf",
    "label_tracking_number": "1Z999AA10123456789",
    "label_courier": "UPS",
    "sold_at": "2025-07-28T10:30:00Z",
    "label_generated_at": "2025-07-28T14:00:00Z",
    "in_transit_at": "2025-07-29T09:00:00Z",
    "updated_at": "2025-07-29T09:00:00Z",
    "cancels_at": "2025-08-04T10:30:00Z",
    "customs_declaration": {
      "commercial_invoice_url": "https://example.com/invoices/1a2b3c4d.pdf",
      "declared_customs_value_cents": 22000
    }
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

POST
/api/v1/orders/{id}/regenerate_label
Regenerate Shipping Label
Regenerate a label or changes the label_type

Parameters
Name	Description
id *
string
(path)
The ID of the order to regenerate a label for

id
label_type
string
(query)
The type of label to generate, defaults to the current label type

LABEL_TYPE_SHIPPING: Standard shipping label for package delivery through carrier services
LABEL_TYPE_DROPOFF: Label for items that need to be dropped off at a designated location
Available values : LABEL_TYPE_INVALID, LABEL_TYPE_SHIPPING, LABEL_TYPE_DROPOFF

Default value : LABEL_TYPE_INVALID

Select...
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "order": {
    "id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "status": "ORDER_STATUS_LABEL_GENERATED",
    "catalog_id": "air-jordan-5-retro-grape-2025-hq7978-100",
    "catalog_name": "Air Jordan 5 Retro 'Grape' 2025",
    "catalog_brand": "Air Jordan",
    "catalog_sku": "HQ7978 100",
    "size": 10.5,
    "price_cents": 22000,
    "price_cents_after_take": 20000,
    "sales_channel": "GOAT",
    "purchase_order_number": "PO-123456",
    "listing_id": "l-xyz-789",
    "label_type": "LABEL_TYPE_SHIPPING",
    "label_url": "https://example.com/labels/1a2b3c4d.pdf",
    "label_tracking_number": "1Z999AA10123456789",
    "label_courier": "UPS",
    "sold_at": "2025-07-28T10:30:00Z",
    "label_generated_at": "2025-07-28T14:00:00Z",
    "in_transit_at": "2025-07-29T09:00:00Z",
    "updated_at": "2025-07-29T09:00:00Z",
    "cancels_at": "2025-08-04T10:30:00Z",
    "customs_declaration": {
      "commercial_invoice_url": "https://example.com/invoices/1a2b3c4d.pdf",
      "declared_customs_value_cents": 22000
    }
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

POST
/api/v1/orders/{id}/ship
Mark Order Shipped
Denotes that an order has been shipped. This will update the order status to in_transit.

Parameters
Name	Description
id *
string
(path)
The ID of the order to ship

id
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "order": {
    "id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "status": "ORDER_STATUS_IN_TRANSIT",
    "fulfillment_status": "FULFILLMENT_STATUS_SELLER_SHIPPED",
    "catalog_id": "air-jordan-5-retro-grape-2025-hq7978-100",
    "catalog_name": "Air Jordan 5 Retro 'Grape' 2025",
    "catalog_brand": "Air Jordan",
    "catalog_sku": "HQ7978 100",
    "size": 10.5,
    "price_cents": 22000,
    "price_cents_after_take": 20000,
    "sales_channel": "GOAT",
    "purchase_order_number": "PO-123456",
    "listing_id": "l-xyz-789",
    "label_type": "LABEL_TYPE_SHIPPING",
    "label_url": "https://example.com/labels/1a2b3c4d.pdf",
    "label_tracking_number": "1Z999AA10123456789",
    "label_courier": "UPS",
    "sold_at": "2025-07-28T10:30:00Z",
    "label_generated_at": "2025-07-28T14:00:00Z",
    "in_transit_at": "2025-07-29T09:00:00Z",
    "updated_at": "2025-07-29T09:00:00Z",
    "cancels_at": "2025-08-04T10:30:00Z",
    "customs_declaration": {
      "commercial_invoice_url": "https://example.com/invoices/1a2b3c4d.pdf",
      "declared_customs_value_cents": 22000
    }
  }
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}
Batch Listing Management


GET
/api/v1/listings/batch
List Batch Operations
Returns a paginated list of batches, and can be filtered based on status.

Parameters
Name	Description
status
string
(query)
The status of the batch to filter.

BATCH_STATUS_PENDING: Batch is queued and waiting to be processed
BATCH_STATUS_IN_PROGRESS: Batch is actively being processed
BATCH_STATUS_COMPLETED: Batch has completed successfully without errors
Available values : BATCH_STATUS_INVALID, BATCH_STATUS_PENDING, BATCH_STATUS_IN_PROGRESS, BATCH_STATUS_COMPLETED

Default value : BATCH_STATUS_INVALID

Select...
pagination_token
string
(query)
Pass the next pagination token received from a subsequent request. If not provided, the default will be the first page in the set.

pagination_token
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "batches": [
    {
      "id": "string",
      "status": "BATCH_STATUS_INVALID",
      "type": "BATCH_TYPE_INVALID",
      "queued": "string",
      "processed": "string",
      "failed": "string"
    }
  ],
  "next_pagination_token": "string",
  "has_more": true
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

GET
/api/v1/listings/batch/{id}
Get Batch Details
Get a specified batch with details.

Parameters
Name	Description
id *
string
(path)
The unique id of the batch.

id
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "id": "string",
  "status": "BATCH_STATUS_INVALID",
  "type": "BATCH_TYPE_INVALID",
  "queued": "string",
  "processed": "string",
  "failed": "string",
  "created_at": "2025-12-22T18:30:06.046Z",
  "processed_at": "2025-12-22T18:30:06.046Z",
  "completed_at": "2025-12-22T18:30:06.046Z"
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

POST
/api/v1/listings/batch_activate
Batch Activate Listings
Activate a batch of listings. Will activate existing listings asynchronously. Please note that there are internal limits on how many batch operations can be processed concurrently. If too many are submitted at once, you may receive an error indicating that your request cannot be processed at this time. In such cases, we recommend allowing some time for ongoing operations to complete before retrying.

Parameters
Name	Description
ids *
array[string]
(query)
The list of listing ids to activate, max size 1,000. Note: if the listing requires pictures, all required pictures must be uploaded for activation to succeed.

Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "batch_id": "string",
  "status": "BATCH_STATUS_INVALID"
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

POST
/api/v1/listings/batch_create
Batch Create Listings
Create a new batch of listings. Will create listings asynchronously. The number of total listings created in your request cannot exceed 1000. The metadata_list field applies metadata individually to each listing under the specified catalog_id, maintaining a one-to-one relationship. Please note that there are internal limits on how many batch operations can be processed concurrently. If too many are submitted at once, you may receive an error indicating that your request cannot be processed at this time. In such cases, we recommend allowing some time for ongoing operations to complete before retrying. Important: For listings that require pictures, all mandatory pictures must be uploaded before activation can succeed. If a picture-required listing fails to activate due to missing pictures, it will be set to inactive status.

Parameters
Name	Description
body *
object
(body)
Example Value
Model
{
  "items": [
    {
      "catalog_id": "some-catalog-id",
      "activate": true,
      "size_unit": "SIZE_UNIT_US",
      "condition": "CONDITION_NEW",
      "packaging_condition": "PACKAGING_CONDITION_GOOD_CONDITION",
      "metadata_list": [
        {
          "key1": "value1"
        },
        {
          "key2": "value2"
        }
      ],
      "price_cents": 2500,
      "size": 10.5,
      "quantity": 2
    }
  ]
}
Parameter content type

application/json
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "batch_id": "batch_1234567890",
  "status": "BATCH_STATUS_PENDING"
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

POST
/api/v1/listings/batch_deactivate
Batch Deactivate Listings
Deactivate a batch of listings. Will deactivate existing listings asynchronously. Please note that there are internal limits on how many batch operations can be processed concurrently. If too many are submitted at once, you may receive an error indicating that your request cannot be processed at this time. In such cases, we recommend allowing some time for ongoing operations to complete before retrying.

Parameters
Name	Description
ids *
array[string]
(query)
The list of listing ids to deactivate, max size 1,000.

Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "batch_id": "string",
  "status": "BATCH_STATUS_INVALID"
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

DELETE
/api/v1/listings/batch_delete
Batch Delete Listings
Delete a batch of listings. Will delete existing listings asynchronously. Please note that there are internal limits on how many batch operations can be processed concurrently. If too many are submitted at once, you may receive an error indicating that your request cannot be processed at this time. In such cases, we recommend allowing some time for ongoing operations to complete before retrying.

Parameters
Name	Description
ids *
array[string]
(query)
The list of listing ids to delete, max size 1,000.

Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "batch_id": "string",
  "status": "BATCH_STATUS_INVALID"
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

GET
/api/v1/listings/batch_operation/quota
Get Batch Quota Status
Get the current count of operations across all your active batches as well as the current max quota allowed. Due to internal limits, there is a maximum number of concurrent operations that can be processed at any given time and is subject to change. If you exceed this limit, you will receive an error indicating that your request cannot be processed at this time. In such cases, we recommend allowing some time for ongoing operations to complete before retrying.

Parameters
No parameters

Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "used_operation_quota": "string",
  "max_operation_quota": "string"
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

GET
/api/v1/listings/batch_operations/{id}
Get Batch Operation Details
Get the operations performed by the specified batch with details. The "result" and "request" fields in the response will only return one of each specified type, i.e. a create_listing_result and a create_listing_request.

Parameters
Name	Description
id *
string
(path)
The unique id of the batch.

id
status
string
(query)
Batch operation status you want to retrieve records for, if empty, will default to retrieving all operations up to pagination limit.

BATCH_OPERATION_STATUS_PENDING: Batch operation is queued and waiting to be processed
BATCH_OPERATION_STATUS_IN_PROGRESS: Batch operation is currently being processed
BATCH_OPERATION_STATUS_COMPLETED: Batch operation has completed successfully
BATCH_OPERATION_STATUS_FAILED: Batch operation encountered an error and did not complete successfully
Available values : BATCH_OPERATION_STATUS_INVALID, BATCH_OPERATION_STATUS_PENDING, BATCH_OPERATION_STATUS_IN_PROGRESS, BATCH_OPERATION_STATUS_COMPLETED, BATCH_OPERATION_STATUS_FAILED

Default value : BATCH_OPERATION_STATUS_INVALID

Select...
limit
string($int64)
(query)
The maximum number of operations to return. The default is 25, the maximum is 500.

limit
pagination_token
string
(query)
Pass the next pagination token received from a prior request. If not provided, the default will be the first page in the set.

pagination_token
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "id": "string",
  "operations": [
    {
      "type": "BATCH_TYPE_INVALID",
      "create_listing_result": {
        "listing": {
          "id": "string",
          "catalog_id": "string",
          "condition": "CONDITION_INVALID",
          "packaging_condition": "PACKAGING_CONDITION_INVALID",
          "size": 0,
          "size_unit": "SIZE_UNIT_INVALID",
          "sku": "string",
          "consigned": true,
          "created_at": "2025-12-22T18:30:06.050Z",
          "updated_at": "2025-12-22T18:30:06.050Z",
          "status": "LISTING_STATUS_INVALID",
          "price_cents": "string",
          "activated_at": "2025-12-22T18:30:06.050Z",
          "metadata": {},
          "defects": [
            "LISTING_DEFECT_INVALID"
          ],
          "additional_defects": "string"
        }
      },
      "update_listing_result": {
        "to": {
          "catalog_id": "string",
          "price_cents": "string",
          "size": 0
        },
        "id": "string"
      },
      "activate_listing_result": {
        "id": "string"
      },
      "deactivate_listing_result": {
        "id": "string"
      },
      "delete_listing_result": {
        "id": "string"
      },
      "errors": [
        "string"
      ],
      "success": true,
      "created_at": "2025-12-22T18:30:06.050Z",
      "processed_at": "2025-12-22T18:30:06.050Z",
      "completed_at": "2025-12-22T18:30:06.050Z",
      "status": "BATCH_OPERATION_STATUS_INVALID",
      "create_listing_request": {
        "catalog_id": "string",
        "activate": true,
        "size_unit": "SIZE_UNIT_INVALID",
        "condition": "CONDITION_INVALID",
        "packaging_condition": "PACKAGING_CONDITION_INVALID",
        "metadata_list": [
          {}
        ],
        "price_cents": "string",
        "size": 0,
        "quantity": "string"
      },
      "update_listing_request": {
        "id": "string",
        "price_cents_change": {
          "new_value": "string",
          "conditional_value": "string",
          "condition_operator": "CONDITION_OPERATOR_INVALID"
        },
        "size_change": {
          "new_value": 0,
          "conditional_value": 0,
          "condition_operator": "CONDITION_OPERATOR_INVALID"
        },
        "catalog_id_change": {
          "new_value": "string",
          "conditional_value": "string",
          "condition_operator": "CONDITION_OPERATOR_INVALID"
        }
      },
      "activate_listing_request": {
        "id": "string"
      },
      "deactivate_listing_request": {
        "id": "string"
      },
      "delete_listing_request": {
        "id": "string"
      }
    }
  ],
  "pagination_token": "string"
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}

POST
/api/v1/listings/batch_update
Batch Update Listings
Update a batch of listings conditionally. Will update existing listings asynchronously. Please note that there are internal limits on how many batch operations can be processed concurrently. If too many are submitted at once, you may receive an error indicating that your request cannot be processed at this time. In such cases, we recommend allowing some time for ongoing operations to complete before retrying.

Parameters
Name	Description
body *
object
(body)
A request to update multiple listings in a batch.

Example Value
Model
{
  "items": [
    {
      "id": "listing-id-1",
      "price_cents_change": {
        "new_value": 3000,
        "condition_operator": "CONDITION_OPERATOR_EQ"
      },
      "size_change": {
        "new_value": 10.5,
        "condition_operator": "CONDITION_OPERATOR_EQ"
      }
    }
  ]
}
Parameter content type

application/json
Responses
Code	Description
200	
A successful response.

Example Value
Model
{
  "batch_id": "string",
  "status": "BATCH_STATUS_INVALID"
}
default	
An unexpected error response.

Example Value
Model
{
  "code": 0,
  "message": "string",
  "details": [
    {
      "@type": "string",
      "additionalProp1": "string",
      "additionalProp2": "string",
      "additionalProp3": "string"
    }
  ]
}
alias by GOAT Group
Cookie SettingsDownloadFAQContact UsFeesPrivacy PolicyTermsSeller Policy
© 2025 1661, Inc. All Rights Reserved




