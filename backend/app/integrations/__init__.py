"""External service clients — Resend, WhatsApp Business API, NIMC, CAC,
Paystack, Cloudinary, Anthropic, OpenAI.

Every client follows the same pattern: a typed async interface, a real
implementation wrapping the vendor SDK or HTTP API, and a dev stub activated
when the relevant credential is empty so the app runs locally without every
secret in place.
"""
