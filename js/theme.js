/* Applies saved theme and text size before first paint (external file, CSP-safe). */
(function(){try{
  var raw=localStorage.getItem('keviata-extras')||localStorage.getItem('keviata-demo-extras');
  var s=raw&&JSON.parse(raw);s=s&&(s.extras||s);s=s&&s.settings||{};
  var t=s.theme||(s.dark===true?'dark':'system');
  if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);
  var map={'קטן':'sm','בינוני':'md','גדול':'lg'};var ts=map[s.textSize]||s.textSize;
  if(ts==='sm'||ts==='lg'||ts==='xl')document.documentElement.setAttribute('data-text',ts);
}catch(e){}})();
