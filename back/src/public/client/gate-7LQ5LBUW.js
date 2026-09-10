import{a as c}from"./chunk-JP7ZQARG.js";import"./chunk-4C666HHU.js";var u=[{start:"#4DD0FF",end:"#3B5BFF"},{start:"#A855F7",end:"#EC4899"},{start:"#22C55E",end:"#06B6D4"},{start:"#3B82F6",end:"#3B82F6"}],p="#111827",f="M 27 28 H 73 C 77 28 80 31 80 35 C 80 39 77 42 73 42 H 57 V 68 C 57 72 54 75 50 75 C 46 75 43 72 43 68 V 42 H 27 C 23 42 20 39 20 35 C 20 31 23 28 27 28 Z";function b(a=v()){let t=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
<defs>
<linearGradient id="t-gradient" x1="20" y1="30" x2="80" y2="70" gradientUnits="userSpaceOnUse">
<stop offset="0%" stop-color="${a.start}"/>
<stop offset="100%" stop-color="${a.end}"/>
</linearGradient>
</defs>
<rect x="4" y="4" width="92" height="92" rx="24" fill="none" stroke="${p}" stroke-width="5"/>
<path d="${f}" fill="url(#t-gradient)"/>
</svg>`;return`data:image/svg+xml;utf8,${encodeURIComponent(t)}`}function v(){return u[Math.floor(Math.random()*u.length)]}var h=b();var g={subtitle:"\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043A\u043E\u0434 \u0438\u0437 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440\u0430",refreshMessage:"\u041D\u0435\u0442 \u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u044F \u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u043E\u043C",refreshButton:"\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C",invalid:"\u0412\u0432\u0435\u0434\u0438\u0442\u0435 6 \u0446\u0438\u0444\u0440 \u0438\u0437 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440\u0430",wrongCode:"\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043A\u043E\u0434",totpUnreachable:"\u0421\u0435\u0440\u0432\u0435\u0440 TOTP \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D",totpError:"\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 TOTP",serverError:"\u041E\u0448\u0438\u0431\u043A\u0430 \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435",noConnection:"\u041D\u0435\u0442 \u0441\u0432\u044F\u0437\u0438 \u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u043E\u043C",generic:"\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043A\u043E\u0434. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u043E\u0437\u0436\u0435."},i=6,n="safe-totp-gate",x="0.0.0.0.0.0",o=class extends HTMLElement{static get observedAttributes(){return["base-url","logo"]}static tagName=n;root;boxes=Array(i).fill("");loading=!1;errorText=null;detached=!1;_baseUrl="";_logo="";_texts=g;_session=null;_internalSession=null;_sessionState={ready:!1,unlocked:!1,stateFailed:!1};unsubscribe=null;inputs=[];boxesHost;refreshBlock;refreshMsgEl;errorEl;logoEl;subtitleEl;retryBtn;constructor(){super(),this.root=this.attachShadow({mode:"open"}),this.root.innerHTML=this.template(),this.bindElements()}connectedCallback(){this.detached=!1,!this._session&&this._baseUrl&&this.ensureInternalSession(),this.render()}disconnectedCallback(){this.detached=!0}attributeChangedCallback(t,e,s){e!==s&&(t==="base-url"?this.baseUrl=s:t==="logo"&&(this.logo=s))}get baseUrl(){return this._baseUrl}set baseUrl(t){this._baseUrl=t,this.ensureInternalSession(),this.render()}get logo(){return this._logo}set logo(t){this._logo=t,this.logoEl&&(this.logoEl.src=t||h)}get texts(){return this._texts}set texts(t){this._texts={...g,...t},this.subtitleEl&&(this.subtitleEl.textContent=this._texts.subtitle),this.refreshMsgEl&&(this.refreshMsgEl.textContent=this._texts.refreshMessage),this.retryBtn&&(this.retryBtn.textContent=this._texts.refreshButton),this.render()}get session(){return this._session}set session(t){this._session=t,this._internalSession&&t&&(this._internalSession.dispose(),this._internalSession=null),this.setupSession(),this.render()}get ready(){return this._sessionState.ready}get unlocked(){return this._sessionState.unlocked}get stateFailed(){return this._sessionState.stateFailed}retry(){let t=this.getSession();t&&t.retry()}lock(){let t=this.getSession();t&&t.lock()}getSession(){return this._session??this._internalSession??null}ensureInternalSession(){if(this._session||this._internalSession||!this._baseUrl)return;let t=c({baseUrl:this._baseUrl});this._internalSession||(this._internalSession=t,this.setupSession(),t.init())}setupSession(){this.unsubscribe&&(this.unsubscribe(),this.unsubscribe=null);let t=this.getSession();t&&(this.unsubscribe=t.onStateChange(e=>{this._sessionState=e,e.unlocked&&this.dispatchUnlocked(t),this.detached||this.render()}),this._sessionState=t.getState())}dispatchUnlocked(t){let e=t.getState().unlocked?this.readNonce():void 0;this.dispatchEvent(new CustomEvent("totp-unlocked",{bubbles:!0,composed:!0,detail:{nonce:e}}))}readNonce(){try{return localStorage.getItem("safe_totp_unlocked_nonce")??void 0}catch{return}}template(){return`
      <style>
        :host { display: block; height: 100%; }
        .gate {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          background: var(--bg, #0f1115);
        }
        .card {
          width: 300px;
          padding: 28px;
          border: 1px solid var(--border, #262b36);
          border-radius: 12px;
          background: var(--bg-widget, #141823);
          text-align: center;
          box-sizing: border-box;
          position: relative;
        }
        .logo {
          width: 56px;
          height: 56px;
          margin: 0 auto 8px;
          border-radius: 8px;
          display: block;
        }
        .subtitle {
          color: var(--text-muted, #8b93a7);
          font-size: 13px;
          margin: 0 0 20px;
          font-family: var(--font, inherit);
        }
        .boxes {
          display: flex;
          justify-content: center;
          gap: 8px;
        }
        .digit {
          width: 40px;
          height: 48px;
          font-size: 20px;
          text-align: center;
          border: 1px solid var(--border, #262b36);
          border-radius: 6px;
          background: var(--bg, #0f1115);
          color: var(--text, #e6e9f0);
          box-sizing: border-box;
          font-family: var(--font, inherit);
        }
        .digit.filled {
          border-color: color-mix(in srgb, var(--accent, #2c6df6) 45%, var(--border, #262b36));
        }
        .digit:focus {
          outline: none;
          border-color: var(--accent, #2c6df6);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #2c6df6) 25%, transparent);
        }
        .digit:disabled { opacity: 0.5; }
        .error {
          color: #e5484d;
          font-size: 12px;
          margin: 12px 0 0;
          font-family: var(--font, inherit);
        }
        .refresh {
          font-size: 13px;
          color: var(--text-muted, #8b93a7);
          margin: 0;
          font-family: var(--font, inherit);
        }
        .refresh-btn {
          margin-top: 14px;
          padding: 8px 22px;
          font-size: 14px;
          border-radius: 6px;
          border: 1px solid var(--accent, #2c6df6);
          background: var(--bg-widget, #141823);
          color: var(--accent, #2c6df6);
          cursor: pointer;
          font-family: var(--font, inherit);
        }
        .refresh-btn:hover { background: var(--bg-hover, #1b2232); }
        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid var(--border, #262b36);
          border-top-color: var(--accent, #2c6df6);
          border-radius: 50%;
          margin: 0 auto 12px;
          animation: totp-spin 0.8s linear infinite;
        }
        @keyframes totp-spin { to { transform: rotate(360deg); } }
        .version {
          position: absolute;
          bottom: 4px;
          right: 4px;
          color: var(--text-muted, #8b93a7);
          font-size: 10px;
          line-height: 1.4;
          font-family: var(--font, inherit);
          user-select: none;
        }
        .hidden { display: none; }
      </style>
      <div class="gate">
        <div class="card">
          <img class="logo" alt="" hidden>
          <p class="subtitle"></p>
          <div class="boxes hidden">${Array.from({length:i},(t,e)=>`<input class="digit" type="text" inputmode="numeric" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="1" aria-label="Digit ${e+1}" data-index="${e}">`).join("")}</div>
          <div class="refresh hidden">
            <p class="refresh"></p>
            <button class="refresh-btn" type="button"></button>
          </div>
          <p class="error hidden"></p>
          <div class="version">${x}</div>
        </div>
      </div>
    `}bindElements(){this.logoEl=this.root.querySelector(".logo"),this.subtitleEl=this.root.querySelector(".subtitle"),this.boxesHost=this.root.querySelector(".boxes"),this.refreshBlock=this.root.querySelector(".refresh"),this.refreshMsgEl=this.root.querySelector(".refresh"),this.errorEl=this.root.querySelector(".error"),this.retryBtn=this.root.querySelector(".refresh-btn"),this.inputs=Array.from(this.boxesHost.querySelectorAll(".digit")),this.logoEl.src=this._logo||h,this.subtitleEl.textContent=this._texts.subtitle,this.refreshMsgEl.textContent=this._texts.refreshMessage,this.retryBtn.textContent=this._texts.refreshButton,this.inputs.forEach((t,e)=>{t.addEventListener("input",s=>this.onInput(e,s)),t.addEventListener("keydown",s=>this.onKeyDown(e,s)),t.addEventListener("paste",s=>this.onPaste(s))}),this.retryBtn.addEventListener("click",()=>this.retry())}focusDigit(t){let e=this.inputs[t];e?.focus(),e?.select()}onInput(t,e){let s=e.target,r=s.value.replace(/\D/g,"").slice(0,1);s.value!==r&&(s.value=r),this.boxes[t]=r,this.errorEl.textContent="",this.errorEl.classList.add("hidden"),s.classList.toggle("filled",r!==""),r&&t<i-1&&this.focusDigit(t+1),this.value.length===i&&this.onSubmit()}onKeyDown(t,e){e.key==="Backspace"&&!this.boxes[t]&&t>0&&(e.preventDefault(),this.focusDigit(t-1)),e.key==="ArrowLeft"&&t>0&&(e.preventDefault(),this.focusDigit(t-1)),e.key==="ArrowRight"&&t<i-1&&(e.preventDefault(),this.focusDigit(t+1))}onPaste(t){let s=((t.clipboardData?.getData("text")??"").match(/\d/g)??[]).slice(0,i);s.length&&(t.preventDefault(),s.forEach((r,d)=>{this.boxes[d]=r;let l=this.inputs[d];l&&(l.value=r,l.classList.toggle("filled",r!==""))}),this.focusDigit(Math.min(i-1,s.length-1)),this.value.length===i&&this.onSubmit())}get value(){return this.boxes.join("")}async onSubmit(){if(this.loading)return;if(!/^\d{6}$/.test(this.value)){this.errorText=this._texts.invalid,this.render();return}let t=this.getSession();if(!t){this.errorText=this._texts.noConnection,this.render();return}this.loading=!0,this.errorText=null,this.render();try{let e=await t.verify(this.value);e.valid&&t.unlock(e.nonce)}catch(e){this.errorText=this.mapError(e)}finally{this.loading=!1,this.render()}}mapError(t){let e=t,s=e?.status,r=e?.error?.code;return s===401?this._texts.wrongCode:s===502?r==="TOTP_UNREACHABLE"?this._texts.totpUnreachable:r==="TOTP_SERVER_ERROR"?this._texts.totpError:this._texts.serverError:s===500?this._texts.serverError:s?this._texts.generic:this._texts.noConnection}render(){if(this.detached||!this.root)return;let t=this._sessionState,e=t.ready&&!t.unlocked&&!t.stateFailed;this.boxesHost.classList.toggle("hidden",!e),this.refreshBlock.classList.toggle("hidden",!(t.ready&&t.stateFailed)),this.inputs.forEach((s,r)=>{s.disabled=this.loading,s.value=this.boxes[r],s.classList.toggle("filled",this.boxes[r]!=="")}),this.errorText?(this.errorEl.textContent=this.errorText,this.errorEl.classList.remove("hidden")):(this.errorEl.textContent="",this.errorEl.classList.add("hidden")),e&&!this.loading&&!this._focused&&this.focusDigit(0)}get _focused(){return document.activeElement instanceof HTMLInputElement&&this.inputs.includes(document.activeElement)}};typeof customElements<"u"&&!customElements.get(n)&&customElements.define(n,o);function _(){typeof customElements<"u"&&!customElements.get(n)&&customElements.define(n,o)}var y=o;export{g as DEFAULT_TEXTS,o as TotpGateElement,y as default,_ as registerTotpGate};
//# sourceMappingURL=gate-7LQ5LBUW.js.map
