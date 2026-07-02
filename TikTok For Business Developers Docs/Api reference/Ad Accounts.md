Ad Accounts
An advertiser account is the basic account on TikTok For Business platform. Before being able to create and manage ads with TikTok For Business, a user must either own an advertiser account or be granted permission by advertisers to manage their advertiser account and assets.

This group consists of the following endpoints:

Get authorized ad accounts
Get ad account details



Get authorized ad accounts
Use this endpoint to obtain a list of advertiser accounts that authorized an app.

Comparing v1.2 and v1.3
The following table outlines the differences between v1.2 and v1.3 endpoints.

Changes	v1.2	v1.3
Endpoint path
/v1.2/oauth2/advertiser/get/
/v1.3/oauth2/advertiser/get/
Request parameter data type
app_id: number
app_id: string
Response parameter data type
advertiser_id: number
advertiser_id: string
Request
Endpoint https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/

Method GET

Header

field	Data Type	Description
Access-Token
Required
string
Authorized access token. For details, see Authentication.
Parameters

field	Data Type	Description
app_id
Required
string
The App id applied by the developer, which can be found on the
Application Management page.
secret
Required
string
The private key of the developer's application, which can be found on the
Application Management page.
Example
curl --get -H "Access-Token:<access_token>" \
--data-urlencode "secret=<secret>" \
--data-urlencode "app_id=<app_id>" \
https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/
Response
Field	Data Type	Description
code
number
Return code, see Return Codes
message
string
Return messages, see Return Codes
data
object
Return data
list
object
Advertiser information list
advertiser_id
string
Authorising Advertiser ID
advertiser_name
string
Authorising Advertiser Name
request_id
string
Request log ID. Uniquely identifying a request.
Example
HTTPS/1.1 200 OK
{
    "message": "OK",
    "code": 0,
    "data": {
        "list": [
            {
                "advertiser_id": "ADVERTISER_ID",
                "advertiser_name": "ADVERTISER_NAME"
            }
        ]
    },
    "request_id": "202003100820230101890492231E063EE3"
}







Get ad account details
Use this endpoint to obtain the details of an advertiser's ad account.

To add a partner and assign ad accounts to this partner, use the /bc/partner/add/ endpoint. Set asset_type to ADVERTISER and pass in advertiser IDs to the asset_ids field. You can get the advertiser IDs in the response field advertiser_id of /advertiser/info/.

Comparing v1.2 and v1.3
The following table outlines the differences between v1.2 and v1.3 endpoints.

Changes	v1.2	v1.3
Endpoint path
/v1.2/advertiser/info/
/v1.3/advertiser/info/
Request parameter data type
advertiser_ids: number[]
advertiser_ids: string[]
Request parameter value name
telephone
phonenumber
reason
id
(all are values in fields)
telephone_number
cellphone_number
rejection_reason
advertiser_id
(all are values in fields)
Response parameter name
reason
phonenumber
telephone
(in the data object)
rejection_reason
cellphone_number
telephone_number
(in the list object)
Response parameter data type
data: object[]
data: object
Response parameter name and data type
id: number
advertiser_id: string
New response parameter
/
list (in the data object)
advertiser_account_type
company_name_editable
can_use_custom_identity
ads_only_mode
Request
Endpoint https://business-api.tiktok.com/open_api/v1.3/advertiser/info/

Method GET

Header

Field	Data Type	Description
Access-Token
Required
string
Authorized access token. For details, see Authentication.
Parameters

Field	Data Type	Description
advertiser_ids
Required
string[]
List of advertiser IDs to query.

You can obtain Advertiser IDs through the /oauth2/advertiser/get/ endpoint.
fields
string[]
A list of information to be returned.

If not specified, all information excluding company_name_editable, can_use_custom_identity, and ads_only_mode is returned by default.

Supported values: telephone_number, contacter, currency, cellphone_number, timezone, advertiser_id, role, company, status, description, rejection_reason, address, name, language, industry, license_no, email, license_url, country, balance, create_time, display_timezone, owner_bc_id, company_name_editable, can_use_custom_identity, and ads_only_mode.
See the Response section for detailed information on each field.

Note: If you include company_name_editable, can_use_custom_identity, or ads_only_mode in the value of this field, only company_name_editable, can_use_custom_identity, or ads_only_mode along with advertiser_id will be returned and other values will be ignored.

Example
Java
Python
PHP
curl
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.*;
import org.apache.http.client.utils.URIBuilder;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.util.Map;

public class Demo {
    private static final String ACCESS_TOKEN = "xxx";
    private static final String PATH = "/open_api/v1.3/advertiser/info/";

    /**
     * Build request URL
     *
     * @param path Request path
     * @return Request URL
     */
    private static String buildUrl(String path) throws URISyntaxException {
        URI uri = new URI("https", "business-api.tiktok.com", path, "", "");
        return uri.toString();
    }


    /**
     * Send GET request
     *
     * @param jsonStr:Args in JSON format
     * @return Response in JSON format
     */
    private static String get(String jsonStr) throws IOException, URISyntaxException {
        OkHttpClient client = new OkHttpClient().newBuilder().build();
        URIBuilder ub = new URIBuilder(buildUrl(PATH));
        ObjectMapper mapper = new ObjectMapper();
        Map< string, object="" > map = mapper.readValue(jsonStr, Map.class);
        map.forEach((k, v) -> {
            try {
                ub.addParameter(k, v instanceof String ? (String) v : mapper.writeValueAsString(v));
            } catch (JsonProcessingException e) {
                e.printStackTrace();
            }
        });
        URL url = ub.build().toURL();

        Request request = new Request.Builder()
                .url(url)
                .method("GET", null)
                .addHeader("Access-Token", ACCESS_TOKEN)
                .build();
        Response response = client.newCall(request).execute();
        return response.body().string();
    }

    public static void main(String[] args) throws IOException, URISyntaxException {
        String fields = FIELDS;
        String advertiser_ids = ADVERTISER_IDS;

        // Args in JSON format
        String myArgs = String.format("{\"fields\": [\"%s\"], \"advertiser_ids\": [\"%s\"]}",fields, advertiser_ids);
        System.out.println(get(myArgs));
    }
}

Response
Field	Data Type	Description
code
number
Response code. For the complete list of response codes and descriptions, see Appendix - Return Codes.
message
string
Response message. For details, see Appendix - Return Codes.
request_id
string
The log id of the request, which uniquely identifies a request.
data
object
Returned data.
list
object[]
Ad account (advertiser account) list.
advertiser_id
string
Advertiser ID.
can_use_custom_identity
boolean
Whether the ad account has custom identities that are available for creating ads.

Supported values:
true: The ad account can use custom identities to create ads.
false: The ad account cannot use custom identities to create ads.
However, in some cases, you can continue to use custom identities. Learn more about the unaffected scenarios in About changes coming to Custom Identity.
ads_only_mode
boolean
Whether the ad account must use "Show through ads only" for Spark Ads created using Spark Ads Push.

Supported values: true, false.

When this field is true, a mandatory "Show through ads only" mode is active for the ad account. As a result, you can only set dark_post_status to ON when creating Spark Ads using Spark Ads Push (through /smart_plus/ad/create/, /ad/create/, or /campaign/spc/create/) or updating ads (through /smart_plus/ad/update/, /ad/update/, or /campaign/spc/update/). This prevents the posts from appearing on your TikTok profile and gaining organic traffic, regardless of the identity's own ads_only_mode setting. It's a safeguard to ensure your Spark Ads Push content remains ads-only and avoids accidental profile posts.

Note: Mandatory "Show through ads only" for an ad account is currently an allowlist-only feature. If you would like to access it, please contact your TikTok representative.

owner_bc_id
string
The ID of a Business Center that the ad account belongs to.

Note: This field will be returned only when the below requirements are both met:

The user has obtained admin access to the owner Business Center (The Business Center that owns the ad account), and
The user has obtained Admin/Operator/Analyst permission for the ad account from the owner Business Center, rather than a partner Business Center.
status
string
Ad account status.

For enum values, see Enumeration - Advertiser Status.

Example: STATUS_ENABLE.
role
string
Ad account role.

For enum values, , see Enumeration - Advertiser Role.

Example: ROLE_ADVERTISER.
rejection_reason
string
Reason for rejection.
name
string
Ad account name.
timezone
string
Ad account time zone including GMT offset, or time zone name in the format of "Region/City" (based on the TZ database name conventions).

Example: Etc/GMT, Europe/London.
display_timezone
string
Time zone name in the format of "Region/City" (based on the TZ database name conventions.

Example: Europe/London.
company
string
Ad account's company name.
company_name_editable
boolean
Whether the company name of the ad account can be updated via API.
If the value of this field is true, you can use the company field in /advertiser/update/ to update the company name.
For non-self-serve advertisers (advertisers directly managed by TikTok representatives), the value of this field will be false. If they want to update the company name, they need to contact their TikTok representatives.
industry
string
Ad account industry category code. For enum values, see Industries.

Example: 290303.
address
string
Ad account address.
country
string
The place of registration code of the ad account.

Example: US.
advertiser_account_type
string
Type of the ad account.

Enum values: RESERVATION (reservation ad account), AUCTION(auction ad account).
currency
string
Type of currency used by the ad account, in ISO 4217 code format.

Example: EUR.
contacter
string
Contact name, in masked format. The name of the person responsible for this account.

Example: Te********************nt.
email
string
Ad account contact email, in masked format.

Example: l***********@*************.
cellphone_number
string
Contact mobile number, in masked format.
telephone_number
string
Fixed phone number, in masked format.
language
string
The code of the language used by the ad account.

Example: en.
license_no
string
Business license number.
license_url
string
Business license preview URL.

The link is valid for an hour by default.
license_province
to-be-deprecated
string
The province where the license was issued.
license_city
to-be-deprecated
string
The city where the license was issued.
promotion_area
to-be-deprecated
string
The geographical area where the ad account's promotions are focused.
promotion_center_province
to-be-deprecated
string
The primary province for the ad account's promotional activities.
promotion_center_city
to-be-deprecated
string
The primary city for the ad account's promotional activities.
brand
to-be-deprecated
string
The brand name of the ad account.
description
string
Brand description.
balance
float
Ad account available balance.

The unit is related to the currency of the ad account.

Example: 5325.43.
create_time
datetime
The time when the ad account was created, in the format of an Epoch/Unix timestamp in seconds.

Example: 1510740064.
Example
{
    "code": 0,
    "message": "OK",
    "request_id": "{{request_id}}",
    "data": {
        "list": [
            {
                "company": "{{company}}",
                "address": null,
                "status": "STATUS_ENABLE",
                "contacter": null,
                "license_province": null,
                "license_city": null,
                "currency": "USD",
                "promotion_area": "0",
                "promotion_center_city": null,
                "cellphone_number": null,
                "timezone": "Etc/GMT+8",
                "description": "{{description}}",
                "rejection_reason": "",
                "advertiser_id": "{{advertiser_id}}",