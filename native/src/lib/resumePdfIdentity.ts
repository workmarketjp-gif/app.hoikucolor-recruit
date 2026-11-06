/**
 * Keep applicant-owned identity fields separate for the Japanese A4 résumé.
 * The on-screen legacy review summary combines them for compact display, but
 * the PDF needs distinct postal code, address kana, telephone and email rows.
 * Values come only from the authenticated canonical readback; never infer a
 * missing address/phone from other candidate or facility records.
 */
export type ResumePdfIdentity = {
  postalCode: string;
  addressKana: string;
  address: string;
  phone: string;
  email: string;
  contactAddress: string;
};

export function buildResumePdfIdentity(
  profile: { phone: string | null; email: string | null },
  resume: {
    postal_code: string | null;
    address_kana: string | null;
    address: string | null;
    contact_address: string | null;
  },
): ResumePdfIdentity {
  const clean = (value: string | null): string => (value ?? '').trim();
  return {
    postalCode: clean(resume.postal_code),
    addressKana: clean(resume.address_kana),
    address: clean(resume.address),
    phone: clean(profile.phone),
    email: clean(profile.email),
    contactAddress: clean(resume.contact_address),
  };
}

/** Rows correspond to the Web A4 fields; omit only the optional alternate mailing address. */
export function resumePdfIdentityRows(identity: ResumePdfIdentity): Array<{ label: string; value: string }> {
  return [
    { label: '現住所（ふりがな）', value: identity.addressKana },
    { label: '現住所', value: [identity.postalCode ? `〒${identity.postalCode}` : '', identity.address].filter(Boolean).join(' ') },
    { label: '電話', value: identity.phone },
    { label: 'E-mail', value: identity.email },
    ...(identity.contactAddress ? [{ label: '連絡先（現住所以外）', value: identity.contactAddress }] : []),
  ];
}
