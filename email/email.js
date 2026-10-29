const M={confirmed:['ההרשמה אושרה','המהדורה היומית תגיע אליכם במייל בכל בוקר.'],unsubscribed:['הדיוור בוטל','לא נשלח אליכם עוד מייל יומי. אפשר להירשם שוב בכל עת מתוך ההגדרות.'],invalid:['הקישור אינו בתוקף','ייתכן שכבר השתמשתם בו. אפשר לבקש קישור חדש מתוך ההגדרות באפליקציה.']}
const s=new URLSearchParams(location.search).get('s'),m=M[s]||M.invalid
document.getElementById('t').textContent=m[0];document.getElementById('d').textContent=m[1];document.title=m[0]+' · קביעותא'
