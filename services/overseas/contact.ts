import { load } from 'cheerio';
import { domainKey } from './deduplication';
import { candidateWebsite } from './candidates/normalize';
import type { ContactStatus, PageSnapshot } from './types';

export const contactPagePattern = /contact|kontakt|inquir|enquir|get[\s_-]*in[\s_-]*touch|nous[\s_-]*contacter|contacter|aanvraag|お問い合わせ|問合せ/i;
export function contactStatus(emails: string[], form: string | null, failed = false): ContactStatus {
  return emails.length ? (form ? 'email_and_form_found' : 'email_found') : form ? 'form_found' : failed ? 'fetch_failed' : 'not_found';
}
export function confirmedContactForm(page: PageSnapshot, website: string) {
  if (!candidateWebsite(page.url) || domainKey(page.url) !== domainKey(website)) return null;
  const $ = load(page.html);
  $('script,style,noscript,template,[hidden],[aria-hidden="true"]').remove();
  for (const el of $('form').toArray()) {
    const form = $(el);
    const context = `${new URL(page.url).pathname} ${$('title').text()} ${$('h1').text()} ${form.attr('id') || ''} ${form.attr('class') || ''} ${form.text()}`;
    if (!contactPagePattern.test(context)) continue;
    const action = form.attr('action');
    if (action) {
      try { if (!candidateWebsite(new URL(action, page.url).toString())) continue; } catch { continue; }
    }
    // A search, login or newsletter field alone is not a contact form.
    const fields = form.find('input:not([type="hidden"]):not([disabled]),textarea:not([disabled])');
    const message = fields.filter((_, node) => node.tagName === 'textarea' || /message|enquir|inquir|nachricht|bericht|vraag|messaggio|お問い合わせ/i.test(`${$(node).attr('name')} ${$(node).attr('id')} ${$(node).attr('placeholder')}`));
    const identity = fields.filter((_, node) => /email|e-mail|mail|name|nom|naam|phone|tel/i.test(`${$(node).attr('type')} ${$(node).attr('name')} ${$(node).attr('id')} ${$(node).attr('placeholder')}`));
    const submit = form.find('button:not([type]),button[type="submit"],input[type="submit"],input[type="image"]').not('[disabled]');
    if (message.length && identity.length && submit.length) return { url: page.url, quote: '公式ページに問い合わせフォーム（連絡先入力欄・本文入力欄・送信ボタン）を確認' };
  }
  return null;
}
