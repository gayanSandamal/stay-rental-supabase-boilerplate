import { describe, expect, it } from 'vitest';
import {
  analyzeScript,
  isSupportedLanguage,
  scriptIsConclusive,
} from '@/lib/moderation/language';

describe('analyzeScript', () => {
  it('detects Sinhala script', () => {
    const a = analyzeScript('නිවසක් කුලියට දෙනු ලැබේ. කාමර 3, කුලිය 65000');
    expect(a.verdict).toBe('si');
  });

  it('detects Tamil script', () => {
    const a = analyzeScript('வாடகைக்கு வீடு. அறைகள் 3, வாடகை 65000');
    expect(a.verdict).toBe('ta');
  });

  it('detects a bilingual Sinhala+Tamil ad', () => {
    const a = analyzeScript('නිවසක් කුලියට / வாடகைக்கு வீடு — Colombo 5');
    expect(a.verdict).toBe('si+ta');
  });

  it('reports plain English as latn (needs model confirmation)', () => {
    expect(analyzeScript('3 bedroom house in Nugegoda, rent 85000').verdict).toBe('latn');
  });

  it('reports romanized Sinhala as latn — the model decides, not the script', () => {
    expect(analyzeScript('Nugegoda gedara kuliyata denu labe kamara 2').verdict).toBe('latn');
  });

  it('holds Sinhala even when Latin digits and city names dominate visually', () => {
    // A real-world mix: mostly Latin characters but genuinely a Sinhala ad.
    const a = analyzeScript('Colombo 5, 2BR, LKR 85000 per month, කුලියට නිවසක්');
    expect(a.verdict).toBe('si');
  });

  it('flags unsupported scripts and names them', () => {
    const hindi = analyzeScript('किराए के लिए मकान उपलब्ध है');
    expect(hindi.verdict).toBe('other');
    expect(hindi.otherScript).toBe('Devanagari');

    expect(analyzeScript('منزل للإيجار في كولومبو').verdict).toBe('other');
    expect(analyzeScript('科伦坡出租房屋三室').verdict).toBe('other');
    expect(analyzeScript('Дом в аренду Коломбо').verdict).toBe('other');
  });

  it('returns unknown when there are no letters at all', () => {
    expect(analyzeScript('85000 /// 2 3 !!! 🏠').verdict).toBe('unknown');
    expect(analyzeScript('').verdict).toBe('unknown');
  });

  it('ignores a stray non-Latin character below the share threshold', () => {
    // One CJK char in a long English ad must not disqualify it.
    const a = analyzeScript(
      'Spacious three bedroom house available for rent in Nugegoda with parking and hot water 中'
    );
    expect(a.verdict).toBe('latn');
  });
});

describe('isSupportedLanguage', () => {
  it('accepts the three national languages and their romanized forms', () => {
    for (const l of ['en', 'si', 'ta', 'si-Latn', 'ta-Latn', 'si+ta']) {
      expect(isSupportedLanguage(l)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    for (const l of ['other:Hindi', 'fr', 'id', 'other:unknown script', '']) {
      expect(isSupportedLanguage(l)).toBe(false);
    }
  });
});

describe('scriptIsConclusive', () => {
  it('is conclusive for Sinhala, Tamil and unsupported scripts', () => {
    expect(scriptIsConclusive(analyzeScript('නිවසක්'))).toBe(true);
    expect(scriptIsConclusive(analyzeScript('வீடு'))).toBe(true);
    expect(scriptIsConclusive(analyzeScript('मकान किराए'))).toBe(true);
  });

  it('is not conclusive for Latin — English vs other Latin languages is a model call', () => {
    expect(scriptIsConclusive(analyzeScript('house for rent'))).toBe(false);
    expect(scriptIsConclusive(analyzeScript(''))).toBe(false);
  });
});
