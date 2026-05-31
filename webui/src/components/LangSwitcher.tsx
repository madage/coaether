import { useLang } from '../i18n/context';

export function LangSwitcher() {
  const { lang, toggleLang, t } = useLang();

  return (
    <button
      onClick={toggleLang}
      title={lang === 'zh' ? 'Switch to English' : '切换到中文'}
      style={{
        padding: '4px 12px',
        background: 'transparent',
        color: '#999',
        border: '1px solid #333',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '0.85em',
        whiteSpace: 'nowrap',
      }}
    >
      {t('switchLang')}
    </button>
  );
}
