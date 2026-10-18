export function installContactForm(doc: Document = document, win: Window = window) {
  const form = doc.querySelector<HTMLFormElement>('#contact-form');
  if (!form || form.dataset.contactInitialized === 'true') return;
  form.dataset.contactInitialized = 'true';
  const copy = JSON.parse(form.dataset.copy ?? '{}') as Record<string, string>;
  const submit = form.querySelector<HTMLButtonElement>('[type=submit]');
  const status = doc.getElementById('form-status');
  const name = form.elements.namedItem('name') as HTMLInputElement;
  const contact = form.elements.namedItem('contact') as HTMLInputElement;
  const message = form.elements.namedItem('message') as HTMLTextAreaElement;
  const draft = doc.querySelector<HTMLTextAreaElement>('#email-draft-text');
  if (submit) submit.disabled = false;
  let sending = false, acceptedValues = '', requestId = '', lastValues = '';
  const readValues = () => ({name: name.value.trim(), contact: contact.value.trim(), message: message.value.trim()});
  const validate = () => {
    name.setCustomValidity(name.value.trim() ? '' : copy.invalidName);
    const value = contact.value.trim();
    const phone = value.replace(/\D/g, '');
    contact.setCustomValidity(/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value) || (/^\+?[\d ()-]+$/.test(value) && phone.length >= 7 && phone.length <= 20) ? '' : copy.invalidContact);
    message.setCustomValidity(message.value.trim().length >= 10 ? '' : copy.invalidMessage);
  };
  form.addEventListener('input', () => {
    validate();
    if (!sending && acceptedValues && status) status.textContent = JSON.stringify(readValues()) === acceptedValues ? copy.accepted : copy.acceptedEdited;
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;
    validate();
    if (!form.reportValidity()) return;
    const values = readValues();
    const signature = JSON.stringify(values);
    if (signature === acceptedValues) { if (status) status.textContent = copy.accepted; return; }
    const text = `${copy.greeting}\n\n${copy.namePrefix}: ${values.name}\n${copy.contactPrefix}: ${values.contact}\n\n${values.message}`;
    if (draft) draft.value = text;
    if (form.dataset.delivery !== 'server') {
      doc.getElementById('email-draft')?.removeAttribute('hidden');
      doc.getElementById('copy-message')?.removeAttribute('hidden');
      if (status) status.textContent = copy.saved;
      doc.dispatchEvent(new Event('klim:email-draft-prepared'));
      return;
    }
    if (!requestId || signature !== lastValues) { requestId = win.crypto.randomUUID(); lastValues = signature; }
    sending = true;
    if (submit) submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    if (status) status.textContent = copy.sending;
    try {
      const website = (form.elements.namedItem('website') as HTMLInputElement).value;
      const response = await win.fetch('/api/contact/', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({...values, locale: form.dataset.locale, requestId, website}),
      });
      const answer = await response.json();
      if (!response.ok || answer.ok !== true || answer.status !== 'accepted') {
        if (status) status.textContent = response.status === 429 ? copy.limited : copy.error;
        doc.getElementById('email-draft')?.removeAttribute('hidden');
        doc.getElementById('copy-message')?.removeAttribute('hidden');
        return;
      }
      acceptedValues = signature;
      doc.getElementById('email-draft')?.setAttribute('hidden', '');
      doc.getElementById('copy-message')?.setAttribute('hidden', '');
      if (status) status.textContent = JSON.stringify(readValues()) === signature ? copy.accepted : copy.acceptedEdited;
      doc.dispatchEvent(new Event('klim:contact-accepted'));
    } catch {
      if (status) status.textContent = copy.error;
      doc.getElementById('email-draft')?.removeAttribute('hidden');
      doc.getElementById('copy-message')?.removeAttribute('hidden');
    } finally {
      sending = false;
      if (submit) submit.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
  doc.getElementById('copy-message')?.addEventListener('click', async () => {
    try { await win.navigator.clipboard.writeText(draft?.value ?? ''); if (status) status.textContent = copy.copied; }
    catch { draft?.select(); if (status) status.textContent = copy.copyManually; }
  });
}
