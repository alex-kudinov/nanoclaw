import type {
  CheckoutFailureGuidanceKey,
  CheckoutRecoveryLocale,
} from './checkout-recovery.js';

export interface CheckoutRecoveryCustomerCopy {
  subject: string;
  title: string;
  body: string;
  supportUrl: string;
  guidanceKey: CheckoutFailureGuidanceKey | 'checkout_incomplete';
  failureSpecific: boolean;
}

type LocaleCopy = {
  subjects: [string, string];
  incomplete: { title: string; body: string };
  guidance: Record<CheckoutFailureGuidanceKey, { title: string; body: string }>;
  supportUrl: string;
};

const COPY: Record<CheckoutRecoveryLocale, LocaleCopy> = {
  en: {
    subjects: [
      'We can help with your checkout',
      'Still need help completing your payment?',
    ],
    incomplete: {
      title: 'Your checkout is still available',
      body: 'You started checkout but it was not completed. You can return to the course page and start a fresh checkout. Reply to this email if you would like help.',
    },
    guidance: {
      verify_card_details: {
        title: 'Check your payment details',
        body: 'Please check the card number, expiration date, security code, and billing details before trying again. You were not charged. Reply to this email if you would like help.',
      },
      authenticate_payment: {
        title: 'Complete your bank verification',
        body: 'Your bank requires an additional verification step. Start a fresh checkout, try again, and complete the bank verification when prompted. You were not charged.',
      },
      use_different_method: {
        title: 'Try another payment method',
        body: 'This payment method could not complete the payment. Please start a fresh checkout and use another card or payment method. You were not charged.',
      },
      contact_issuer_or_change_method: {
        title: 'Contact your card issuer or try another method',
        body: 'Your bank declined the payment without giving us a specific reason. Contact your card issuer or start a fresh checkout with another payment method. You were not charged. Reply if you would like help.',
      },
      retry_later_or_change_method: {
        title: 'Try again later or use another method',
        body: 'The payment could not be processed right now. Try once more later; if it still fails, use another payment method or contact your card issuer. You were not charged.',
      },
      generic_decline: {
        title: 'Your payment was not approved',
        body: 'Your payment was not approved. Contact your card issuer or start a fresh checkout with another payment method. You were not charged. Reply to this email if you would like help.',
      },
    },
    supportUrl: 'https://tandemcoach.co/contact-us/',
  },
  es: {
    subjects: [
      'Podemos ayudarte con tu inscripción',
      '¿Sigues necesitando ayuda con tu pago?',
    ],
    incomplete: {
      title: 'Tu proceso de inscripción sigue disponible',
      body: 'Iniciaste el pago, pero no se completó. Puedes volver a la página del curso e iniciar un pago nuevo. Responde a este correo si necesitas ayuda.',
    },
    guidance: {
      verify_card_details: {
        title: 'Comprueba los datos de pago',
        body: 'Comprueba el número, la fecha de vencimiento, el código de seguridad y los datos de facturación antes de intentarlo de nuevo. No se realizó ningún cargo. Responde si necesitas ayuda.',
      },
      authenticate_payment: {
        title: 'Completa la verificación de tu banco',
        body: 'Tu banco requiere una verificación adicional. Inicia un pago nuevo, inténtalo otra vez y completa la verificación cuando aparezca. No se realizó ningún cargo.',
      },
      use_different_method: {
        title: 'Prueba otro método de pago',
        body: 'Este método no pudo completar el pago. Inicia un pago nuevo y utiliza otra tarjeta u otro método. No se realizó ningún cargo.',
      },
      contact_issuer_or_change_method: {
        title: 'Contacta con tu banco o prueba otro método',
        body: 'Tu banco rechazó el pago sin indicar un motivo específico. Contacta con el emisor de la tarjeta o inicia un pago nuevo con otro método. No se realizó ningún cargo. Responde si necesitas ayuda.',
      },
      retry_later_or_change_method: {
        title: 'Inténtalo más tarde o usa otro método',
        body: 'No se pudo procesar el pago ahora. Inténtalo una vez más tarde; si vuelve a fallar, usa otro método o contacta con tu banco. No se realizó ningún cargo.',
      },
      generic_decline: {
        title: 'Tu pago no fue aprobado',
        body: 'Tu pago no fue aprobado. Contacta con tu banco o inicia un pago nuevo con otro método. No se realizó ningún cargo. Responde a este correo si necesitas ayuda.',
      },
    },
    supportUrl: 'https://tandemcoach.co/es/contacto/',
  },
  fr: {
    subjects: [
      'Nous pouvons vous aider avec votre inscription',
      'Avez-vous encore besoin d’aide pour votre paiement ?',
    ],
    incomplete: {
      title: 'Votre inscription est toujours disponible',
      body: 'Vous avez commencé le paiement, mais il n’a pas été finalisé. Revenez à la page du cours pour démarrer un nouveau paiement. Répondez à cet e-mail si vous souhaitez de l’aide.',
    },
    guidance: {
      verify_card_details: {
        title: 'Vérifiez vos informations de paiement',
        body: 'Vérifiez le numéro, la date d’expiration, le cryptogramme et les informations de facturation avant de réessayer. Aucun montant n’a été débité. Répondez si vous souhaitez de l’aide.',
      },
      authenticate_payment: {
        title: 'Terminez la vérification bancaire',
        body: 'Votre banque exige une vérification supplémentaire. Démarrez un nouveau paiement, réessayez et terminez la vérification lorsqu’elle apparaît. Aucun montant n’a été débité.',
      },
      use_different_method: {
        title: 'Essayez un autre moyen de paiement',
        body: 'Ce moyen n’a pas permis de finaliser le paiement. Démarrez un nouveau paiement avec une autre carte ou un autre moyen. Aucun montant n’a été débité.',
      },
      contact_issuer_or_change_method: {
        title: 'Contactez votre banque ou essayez un autre moyen',
        body: 'Votre banque a refusé le paiement sans fournir de motif précis. Contactez l’émetteur de la carte ou démarrez un nouveau paiement avec un autre moyen. Aucun montant n’a été débité. Répondez si vous souhaitez de l’aide.',
      },
      retry_later_or_change_method: {
        title: 'Réessayez plus tard ou utilisez un autre moyen',
        body: 'Le paiement ne peut pas être traité pour le moment. Réessayez une fois plus tard ; si l’échec persiste, utilisez un autre moyen ou contactez votre banque. Aucun montant n’a été débité.',
      },
      generic_decline: {
        title: 'Votre paiement n’a pas été approuvé',
        body: 'Votre paiement n’a pas été approuvé. Contactez votre banque ou démarrez un nouveau paiement avec un autre moyen. Aucun montant n’a été débité. Répondez si vous souhaitez de l’aide.',
      },
    },
    supportUrl: 'https://tandemcoach.co/fr/contact/',
  },
  ja: {
    subjects: [
      'お申し込みをお手伝いします',
      'お支払いについて、まだサポートが必要ですか？',
    ],
    incomplete: {
      title: 'お申し込み手続きは引き続き可能です',
      body: 'お支払い手続きが開始されましたが、完了していません。コースページに戻り、新しいお支払い手続きを開始してください。サポートが必要な場合は、このメールにご返信ください。',
    },
    guidance: {
      verify_card_details: {
        title: 'お支払い情報をご確認ください',
        body: 'カード番号、有効期限、セキュリティコード、請求先情報をご確認のうえ、もう一度お試しください。請求は発生していません。サポートが必要な場合はご返信ください。',
      },
      authenticate_payment: {
        title: '銀行の認証を完了してください',
        body: '銀行による追加認証が必要です。新しいお支払い手続きを開始し、表示された銀行認証を完了してください。請求は発生していません。',
      },
      use_different_method: {
        title: '別のお支払い方法をお試しください',
        body: 'このお支払い方法では決済を完了できませんでした。新しいお支払い手続きで、別のカードまたはお支払い方法をご利用ください。請求は発生していません。',
      },
      contact_issuer_or_change_method: {
        title: 'カード発行会社に連絡するか、別の方法をお試しください',
        body: '銀行は具体的な理由を示さずに支払いを拒否しました。カード発行会社に連絡するか、新しいお支払い手続きで別の方法をご利用ください。請求は発生していません。サポートが必要な場合はご返信ください。',
      },
      retry_later_or_change_method: {
        title: '時間をおいて再試行するか、別の方法をご利用ください',
        body: '現在お支払いを処理できません。時間をおいて一度お試しいただき、再度失敗する場合は別の方法を利用するか、カード発行会社にお問い合わせください。請求は発生していません。',
      },
      generic_decline: {
        title: 'お支払いは承認されませんでした',
        body: 'お支払いは承認されませんでした。カード発行会社に連絡するか、新しいお支払い手続きで別の方法をご利用ください。請求は発生していません。サポートが必要な場合はご返信ください。',
      },
    },
    supportUrl: 'https://tandemcoach.co/ja/contact/',
  },
};

export function checkoutRecoveryCustomerCopy(input: {
  locale: CheckoutRecoveryLocale;
  guidanceKey: CheckoutFailureGuidanceKey | null;
  touch: 1 | 2;
}): CheckoutRecoveryCustomerCopy {
  const locale = COPY[input.locale];
  const content = input.guidanceKey
    ? locale.guidance[input.guidanceKey]
    : locale.incomplete;
  return {
    subject: locale.subjects[input.touch - 1],
    title: content.title,
    body: content.body,
    supportUrl: locale.supportUrl,
    guidanceKey: input.guidanceKey ?? 'checkout_incomplete',
    failureSpecific: input.guidanceKey !== null,
  };
}
