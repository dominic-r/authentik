cog weel -> system
"authentication methods" in left menu bar
"add configuration" blue button top right
Name: authentik
Authentication method: Openid connect single-sign-on

OpenID Connect settings
Issuer URL*
The complete URL of the OpenID Provider. Needs to be unique.
Client ID*
The client identifier, as registered with the OpenID Provider.
Client secret*
Client secret is used in conjunction with the Client ID to authenticate the client application against the OpenID Provider.
Username mapping*
Used to map IdP claims to the username, e.g. ${sub}
Additional scopes
Select...
The default scope is 'openid'. Add more scopes if needed to obtain the username claim.
Give these URLs to your identity provider
Redirect URL
Location where the client is sent to after successful account authentication.
Initiate login URL
URL used for OpenID Provider-initiated login.
Additional settings
The authorization, token, and user info endpoints will be filled automatically if your Identity provider offers this option. If not, you will be asked to provide this information.
Fill the data automatically from my chosen identity provider.
JIT provisioning
Just-in-time user provisioning allows users to be created and updated automatically when they log in through SSO to Atlassian Data Center applications. Learn more.
Create users on login to the application
OpenID Connect behaviour
Remember user logins
If checked, successful login history will be saved and users will be logged in automatically without the need for reauthentication.
Login page settings
Decide if the IdP should be visible on login page and customize what the user will see on the button.
Show IdP on the login page
Login button text*
The text is shown to the user on the login page. Remaining characters: 40.

nb: they give you the redirect @ https://jira.sdko.net/plugins/servlet/oidc/callback
username mapping: `preferred_username` + incl same note as in mastodon
Additional scopes: add email and profile. openid is by default

JIT yes: 

Display name*
Used to map IdP claims to a user's display name, e.g. ${firstName} ${lastName}
Email*
Used to map IdP claims to a user's email, e.g. ${email}
Groups*
Claim containing user's groups. Doesn't support mapping expressions.
JIT scopes
profile
email
groups

for display name I did pref username too but I should create a proprety mapping or whatnot. I'll ask
email: email
groups: groups
Login button text: continue with authentik; log in with authentik. IDRC


When done, click "Save configuration"


UUID: b6544961-cb35-40bc-8425-56ffcf68751d] Received SSO request for user preferred_username, but the user is not permitted to log in
com.atlassian.plugins.authentication.sso.web.usercontext.AuthenticationFailedException: Received SSO request for user preferred_username, but the user is not permitted to log in
        at com.atlassian.plugins.authentication.sso.web.oidc.OidcConsumerServlet.doGet(OidcConsumerServlet.java:130)


  ...... aaaaa

at https://jira.sdko.net/plugins/servlet/authentication-config click 3 dots nexto authentik and click test sign in
