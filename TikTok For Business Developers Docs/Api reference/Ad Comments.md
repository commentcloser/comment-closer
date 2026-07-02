#0
Ad Comments
For standard video ads, or Spark Ads that are created by users who have linked to TikTok Business Accounts, if you have enabled commenting, you can manage the comments under the ads using Ad Comments API. You can get, update, reply to, delete, export comments, or update the statuses of comments.

You can also define a list of blocked words. If a comment contains a blocked word, it will be hidden to everyone except the user who made the comment. For the list of endpoints for blocked words, see Ad Comments - Blocked Words.

This group consists of the following endpoints:

Get comments
Get related comments
Update the statuses of comments
Reply to a comment
Delete a comment
Create a comment export task
Get the status of a comment export task
Download exported comments


#1
Get comments
Use this endpoint to get the comments under the video ads of an ad account.

You need to specify a search value and the time range for the comments you want to get. This endpoint returns comments for both paid impression ads and Spark Ads.

Comparing v1.2 and v1.3
The following table outlines the differences between v1.2 and v1.3 endpoints.

Changes	v1.2	v1.3
Endpoint path
/v1.2/comment/list/
/v1.3/comment/list/
Request parameter data type
advertiser_id: number
advertiser_id: string
Response parameter name
is_top
list
is_pinned
comments
Response parameter data type
comment_id: number
original_comment_id: number
campaign_id: number
adgroup_id: number
ad_id: number
comment_id: string
original_comment_id: string
campaign_id: string
adgroup_id: string
ad_id: string
Response parameter name and data type
app_id: number
item_id: number
app: string
tiktok_item_id: string
New response parameter
/
video_play_url
video_cover_url
user_avatar_url
user_name
user_id
Request
Endpoint https://business-api.tiktok.com/open_api/v1.3/comment/list/

Method GET

Header

Field	Type	Description
Access-Token
required
string
Authorized access token. For details, see Authentication.
Parameters

Field	Type	Description
advertiser_id
required
string
Advertiser ID.
comment_type
string[]
Comment type.

Enum values: ALL, COMMENT, REPLY.

Default value: ["ALL"]
search_field
required
string
Field to search by.

Enum value:
ADGROUP_ID: To filter by an ad group ID.
search_value
required
string
Value to search.

When search_field is ADGROUP_ID, specify an ad group ID via this field.
To obtain the list of ad groups within your ad account, use /adgroup/get/.

Example: 1234567891234567.
sort_field
string
Field to sort by.

Enum values: CREATE_TIME, LIKES, REPLIES.

Default value: CREATE_TIME.
sort_type
string
Sorting order.

Enum values: ASC, DESC.

Default value: DESC.
start_time
required
string
Start date of the time range that you want to get comments, in the format of YYYY-MM-DD.
end_time
required
string
End date of the time range that you want to get comments, in the format of YYYY-MM-DD.
page_size
number
Page size.

Value range: 1-100.

Default value: 10.
page
number
Current page number.

Value range: ≥ 1.

Default value: 1.
Example
curl --get -H "Access-Token:xxx" \
--data-urlencode "advertiser_id=ADVERTISER_ID" \
--data-urlencode "start_time=START_TIME" \
--data-urlencode "end_time=END_TIME" \
--data-urlencode "comment_type=[\"comment_type\"]" \
--data-urlencode "page_size=PAGE_SIZE" \
--data-urlencode "page=PAGE" \
--data-urlencode "search_value=SEARCH_VALUE" \
--data-urlencode "search_field=SEARCH_FIELD" \
--data-urlencode "sort_field=SORT_FIELD" \
--data-urlencode "sort_by_asc=SORT_BY_ASC" \
--data-urlencode "comment_status=[\"COMMENT_STATUS\"]" \
https://business-api.tiktok.com/open_api/v1.3/comment/list/
Response
Field	Type	Description
message
string
The return message. For Details, see Appendix - Return Codes.
code
number
The return code. For details, see Appendix-Return Code.
data
object
The returned data.
comments
object[]
List of comments.
comment_id
string
Comment ID.
app
string
App ID.
content
string
Comment content.
likes
number
Number of likes.
replies
number
Number of replies.
comment_type
string
Comment type. It can be COMMENT, which is an original comment, or REPLY, which is a reply to an original comment.
original_comment_id
string
ID of the original comment. A value will be returned only when comment_type is REPLY.
comment_status
string
Comment status. Enum values: HIDDEN, PUBLIC.
hit_blockedword
boolean
Whether the comment contains blocked words.
ad_text
string
Ad title.
create_time
string
The time when the comment is created.
campaign_id
string
ID of the campaign that contains the ad that the comment is added to.
campaign_name
string
Name of the campaign that contains the ad that the comment is added to.
adgroup_id
string
ID of the ad group that contains the ad that the comment is added to.
adgroup_name
string
Name of the ad group that contains the ad that the comment is added to.
ad_id
string
ID of the ad that the comment is added to.
ad_name
string
Name of the ad that the comment is added to.
tiktok_item_id
string
TikTok video ID.
identity_id
string
Identity ID.
identity_type
string
Identity type. CUSTOMIZED_USER (Customized User), TT_USER (TikTok Business Account User). For details about identities, see Identities.
is_pinned
boolean
Whether the comment is pinned.
can_delete
boolean
Whether the comment can be deleted.
is_auth_ttba
boolean
Whether the user is linked to a TikTok Business Account.
is_auth_comment_manage_scope
boolean
Whether the user has the comment management permission.
video_play_url
string
Video play URL.
video_cover_url
string
Video cover URL.
user_avatar_url
string
URL to the users' avatar.
user_name
string
Unique user name.
user_id
string
The ID of the TikTok user who made the comment.

Example: "6123456789123456789".
page_info
object
Page information.
page
number
Current page number.
page_size
number
Page size.
total_number
number
Total number of results.
total_page
number
Total number of pages.
request_id
string
Unique ID of the request.
Example
HTTPS/1.1 200 OK
{
    "code": 0,
    "message": "OK",
    "request_id": "202105210639490102360430824C1AE673",
    "data": {
        "comments": [
            {
                "likes": 0,
                "create_time": "2021-01-14 07:04:16 +0000 UTC",
                "comment_type": "COMMENT",
                "hit_blockedword": false,
                "ad_text": "",
                "campaign_name": "Bytedance_3006_JP_JA_IOS/AND_1123_dogfood",
                "adgroup_name": "Ad Group20201123093958",




#2
Get related comments
Use this endpoint to get related comments.

For an original comment, you can get the comment itself and all of its replies. For a reply, you can get the reply and its original comment.

Comparing v1.2 and v1.3
The following table outlines the differences between v1.2 and v1.3 endpoints.

Changes	v1.2	v1.3
Endpoint path
/v1.2/comment/reference/
/v1.3/comment/reference/
Request parameter data type
advertiser_id: number
comment_id: number
original_comment_id: number
advertiser_id: string
comment_id: string
original_comment_id: string
Response parameter name
list
is_top
comments
is_pinned
Response parameter data type
comment_id: number
comment_id: string
Response parameter name and data type
item_id: number
tiktok_item_id: string
New response parameter
/
user_id
Request
Endpoint https://business-api.tiktok.com/open_api/v1.3/comment/reference/

Method GET

Header

Field	Type	Description
Access-Token
required
string
Authorized access token. For details, see Authentication.
Parameters

Field	Type	Description
advertiser_id
Required
string
Advertiser ID.
comment_id
Required
string
Comment ID.
comment_type
Required
string
Comment type. It can be COMMENT, which is an original comment, or REPLY, which is a reply to an original comment.
original_comment_id
string
ID of the original comment. A value will be returned only when comment_type is REPLY`.
page_size
number
Page size.

Value range: 1-1000.

Default value: 10.
page
number
Current page number.

Value range: ≥ 1.

Default value: 1.
Example
curl --get -H "Access-Token:xxx" \
--data-urlencode "advertiser_id=ADVERTISER_ID" \
--data-urlencode "comment_id=COMMENT_ID" \
--data-urlencode "page_size=PAGE_SIZE" \
--data-urlencode "original_comment_id=COMMENTAL_COMMENT_ID" \
--data-urlencode "comment_type=comment_type" \
--data-urlencode "page=PAGE" \
https://business-api.tiktok.com/open_api/v1.3/comment/reference/
Response
Field	Type	Description
message
string
The return message. For Details, see Appendix - Return Codes.
code
number
The return code. For details, see Appendix-Return Code.
data
object
The returned data.
comments
object[]
List of comments.
comment_id
string
Comment ID.
content
string
Comment content.
comment_type
string
Comment type. It can be COMMENT, which is an original comment, or REPLY, which is a reply to an original comment.
comment_status
string
Comment status. Enum values: HIDDEN, PUBLIC.
hit_blockedword
boolean
Whether the comment contains blocked words.
create_time
string
The time when the comment is created.
user_name
string
User who made the comment.
user_id
string
The ID of the TikTok user who made the comment.

Example: "6123456789123456789".
user_avatar_url
string
URL to the users' avatar.
tiktok_item_id
string
TikTok video ID.
identity_id
string
Identity ID.
identity_type
string
Identity type. CUSTOMIZED_USER (Customized User), TT_USER (TikTok Business Account User). For details about identities, see Identities.
is_pinned
boolean
Whether the comment is pinned.
can_delete
boolean
Whether the comment can be deleted.
is_auth_ttba
boolean
Whether the user is linked to a TikTok Business Account.
is_auth_comment_manage_scope
boolean
Whether the user has the comment management permission.
reply_user_info
object
Information about the user who posted the original comment. Valid only for replies (second-level or lower comments). Returns null for first-level comments.
page_info
object
Page information.
page
number
Current page number.
page_size
number
Page size.
total_number
number
Total number of results.
total_page
number
Total number of pages.
request_id
string
Unique ID of the request.
Example
HTTPS/1.1 200 OK
{
    "message": "OK",
    "code": 0,
    "data": {}
}



#3
Update the statuses of comments
Use this endpoint to change the statuses of a list of comments from public to hidden, or vice versa.

Comparing v1.2 and v1.3
The following table outlines the differences between v1.2 and v1.3 endpoints.

Changes	v1.2	v1.3
Endpoint path
/v1.2/comment/status/update/
/v1.3/comment/status/update/
Request parameter data type
advertiser_id: number
comment_ids: number[]
advertiser_id: string
comment_ids: string[]
Request
Endpoint https://business-api.tiktok.com/open_api/v1.3/comment/status/update/

Method POST

Header

Field	Type	Description
Access-Token
required
string
Authorized access token. For details, see Authentication.
Content-Type
required
string
Content type of the request. Allowed value: application/json
Parameters

Field	Type	Description
advertiser_id
required
string
Advertiser ID
comment_ids
required
string[]
Comment ID
operation
required
string
Operation type. Enum values: HIDDEN (change comments to hidden), PUBLIC (make comments public).
Example
curl --location --request POST '{{base_url}}/v1.3/comment/status/update/' \
--header 'Access-Token: {{Access-Token}}' \
--header 'Content-Type: application/json' \
--data-raw '{
  "advertiser_id": {{advertiser_id}},
  "comment_ids": {{comment_ids}},
  "operation": "PUBLIC"
}'
Response
Field	Type	Description
message
string
The return message. For Details, see Appendix - Return Codes.
code
number
The return code. For details, see Appendix-Return Code.
request_id
string
Unique ID of the request
Example
HTTPS/1.1 200 OK
{
    "message": "OK",
    "code": 0,
    "data": {}
}



#4
Reply to a comment
Use this endpoint to reply to a comment.

For TikTok ads that are created by users linked to TikTok User or Custom User types of identities (identity_type = TT_USER or CUSTOMIZED_USER), users who are linked to these two types of identities and have comment management permissions can reply to first-level comments under the ads.

Comparing v1.2 and v1.3
The following table outlines the differences between v1.2 and v1.3 endpoints.

Changes	v1.2	v1.3
Endpoint path
/v1.2/comment/post/
/v1.3/comment/post/
Request parameter data type
advertiser_id: number
comment_id: number
ad_id: number
advertiser_id: string
comment_id: string
ad_id: string
Request parameter name and data type
item_id: number
tiktok_item_id: string
Response parameter data type
comment_id: number
reply_to_comment_id: number
comment_id: string
reply_to_comment_id: string
Response parameter name and data type
item_id: number
tiktok_item_id: string
Response parameter deprecated in v1.3
/
identity_type(in data)
Request
Endpoint

https://business-api.tiktok.com/open_api/v1.3/comment/post/

Method POST

Header

Field	Data Type	Description
Access-Token
Required
string
Authorized access token. For details, see Authentication.
Content-Type
Required
string
The content type of the request.
Allowed value: "application/json".
Parameters

Field	Data Type	Description
advertiser_id
Required
string
Advertiser ID
ad_id
Required
string
Ad ID
tiktok_item_id
Required
string
TikTok video ID
comment_id
Required
string
ID of the comment that you want reply to
comment_type
Required
string
Comment type. Currently, only REPLY is supported.
text
Required
string
Comment text.
identity_type
Required
string
Type of the identity that are linked to the user.

Enum values: CUSTOMIZED_USER (Custom User), TT_USER (TikTok User).

For details about identity types, see Identities.
identity_id
Required
string
Identity ID
Example
curl -H "Access-Token:xxx" -H "Content-Type:application/json" -X POST \
-d '{
    "advertiser_id": "ADVERTISER_ID",
    "ad_id": "AD_ID",
    "tiktok_item_id": "TIKTOK_ITEM_ID",
    "comment_id": "COMMENT_ID",
    "comment_type": "COMMENT_TYPE",
    "text": "TEXT",
    "identity_type": "IDENTITY_TYPE",
    "identity_id": "IDENTITY_ID"
}' \
https://business-api.tiktok.com/open_api/v1.3/comment/post/
Response
Field	Data Type	Description
code
number
Response code. For the complete list of response codes and descriptions, see Appendix - Return Codes.
message
string
Response message. For details, see Appendix - Return Codes.
data
object
Returned data.
comment_id
string
ID of the comment or reply that has just been created.
tiktok_item_id
string
ID of the TikTok video
text
string
Comment or reply text that you just created
create_time
string
Time when your comment or reply was created (UTC+0), in the format of YYYY-MM-DD HH:MM:SS.
reply_to_comment_id
string
ID of the comment that you replied to
request_id
string
The log id of the request, which uniquely identifies a request.
Example
HTTPS/1.1 200 OK
{
    "message": "OK",
    "code": 0,
    "data": {
        "comment_id": "7122941661025993518",
        "text": "Hello word",
        "reply_to_comment_id": "7122941661025993510",
        "item_id": 0,
        "create_time": "2022-06-07"
    }
}





#5
Delete a comment
Use this endpoint to delete a comment.

For users who add comments to TikTok ads that are created by users linked to Custom User or TikTok User types of identities (identity_type = CUSTOMIZED_USER or TT_USER), they can delete their own comments.

Comparing v1.2 and v1.3
The following table outlines the differences between v1.2 and v1.3 endpoints.

Changes	v1.2	v1.3
Endpoint path
/v1.2/comment/delete/
/v1.3/comment/delete/
Request parameter data type
advertiser_id: number
comment_id: number
ad_id: number
advertiser_id: string
comment_id: string
ad_id: string
Request parameter name and data type
item_id: number
tiktok_item_id: string
Request
Endpoint

https://business-api.tiktok.com/open_api/v1.3/comment/delete/

Method POST

Header

Field	Data Type	Description
Access-Token
Required
string
Authorized access token. For details, see Authentication.
Content-Type
Required
string
The content type of the request.
Allowed value: "application/json".
Parameters

Field	Data Type	Description
advertiser_id
Required
string
Advertiser ID
ad_id
Required
string
Ad ID
tiktok_item_id
Required
string
TikTok Video ID
comment_id
Required
string
ID of the comment you want delete
identity_type
Required
string
Type of the identity that are linked to the user. Enum values: CUSTOMIZED_USER (Custom User), TT_USER (TikTok User). For details about identity types, see Identities.
identity_id
Required
string
Identity ID
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
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class Demo {
    private static final String ACCESS_TOKEN = "xxx";
    private static final String PATH = "/open_api/v1.3/comment/delete/";
    private static final ObjectMapper mapper = new ObjectMapper();

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
     * Send POST request
     *
     * @param jsonStr Args in JSON format
     * @return Response in JSON format
     */
    private static String post(String jsonStr) throws IOException, URISyntaxException {
        OkHttpClient client = new OkHttpClient().newBuilder().build();
        String url = buildUrl(PATH);

        RequestBody body = RequestBody.create(MediaType.parse("application/json"), jsonStr);
        Request request = new Request.Builder()
                .url(url)
                .method("POST", body)
                .addHeader("Content-Type", "application/json")
                .addHeader("Access-Token", ACCESS_TOKEN)
                .build();
        Response response = client.newCall(request).execute();
        return response.body().string();
    }


    public static void main(String[] args) throws IOException, URISyntaxException {
        String advertiser_id = ADVERTISER_ID;
        String ad_id = AD_ID;
        String tiktok_item_id = TIKTOK_ITEM_ID;
        String comment_id = COMMENT_ID;
        String identity_type = IDENTITY_TYPE;
        String identity_id = IDENTITY_ID;

        // Args in JSON format
        String myArgs = String.format("{\"advertiser_id\": \"%s\", \"ad_id\": \"%s\", \"tiktok_item_id\": \"%s\", \"comment_id\": \"%s\", \"identity_type\": \"%s\", \"identity_id\": \"%s\"}",advertiser_id, ad_id, tiktok_item_id, comment_id, identity_type, identity_id);
        System.out.println(post(myArgs));
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
data
object
Returned data.
request_id
string
The log id of the request, which uniquely identifies a request.
Example
HTTPS/1.1 200 OK
{
    "message": "OK",
    "code": 0,
    "data": {}
}