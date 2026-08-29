# Checkout recovery Encharge templates

These files are the tracked source for active Encharge flow `400441`. The host
sets the subject and safe, localized remediation fields on the person before
emitting `checkout_recovery_reminder_ready_v2`; these templates render those
person fields because event-property merge tags are unreliable in this account.

| Locale | Touch | Template ID | File |
| --- | ---: | ---: | --- |
| English | 1 | `479523` | `en-touch-1.html` |
| English | 2 | `479524` | `en-touch-2.html` |
| Spanish | 1 | `479525` | `es-touch-1.html` |
| Spanish | 2 | `479526` | `es-touch-2.html` |
| French | 1 | `479527` | `fr-touch-1.html` |
| French | 2 | `479528` | `fr-touch-2.html` |
| Japanese | 1 | `479529` | `ja-touch-1.html` |
| Japanese | 2 | `479530` | `ja-touch-2.html` |

Every template must keep the product, return URL, safe guidance title/body,
support URL, preference, unsubscribe, reply-to, and Coach Training category
contracts. The subject is `{{person.checkout_recovery_subject}}` for all eight.
Raw Stripe codes and provider error text are prohibited.
