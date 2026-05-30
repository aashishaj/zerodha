# Experimental Sandbox

This folder is isolated on purpose.

Use it for:
- testing alternate Zerodha login flows
- trying third-party auto-login repos
- validating risky ideas before they touch the main app

Rules for this folder:
- do not import experimental code into the main app until it is reviewed
- do not store real passwords, TOTP secrets, or access tokens in committed files
- keep any third-party repo code inside a subfolder here

Suggested layout:
- `experimental/third_party/`
- `experimental/notes/`
- `experimental/tmp/`

Current status:
- sandbox created
- main app left untouched

Next step:
- place the external repo or its files inside `experimental/third_party/`
- then we can test it without affecting the current login flow
