/* FX level before first paint: saved choice, else High on desktop / Low on phone; reduced motion => Off */
(function(){var d=document.documentElement,s=null;try{s=localStorage.getItem('dch-fx')}catch(e){}
if(!s){s=matchMedia('(prefers-reduced-motion: reduce)').matches?'off':(matchMedia('(pointer:coarse)').matches||innerWidth<760)?'low':'high'}d.dataset.fx=s})();
/* Clickjacking guard: a static host cannot send frame-ancestors, so if another site frames this page, break out of the frame (or blank it). */
(function(){try{if(window.top!==window.self){try{window.top.location.replace(window.self.location.href)}catch(e){}document.documentElement.style.display='none'}}catch(e){document.documentElement.style.display='none'}})();
