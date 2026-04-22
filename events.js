/**
 * 藝境空間 | 活動報名站 - 詳情頁核心邏輯
 * 移植自「場地租借系統」之定案版本，確保報名體驗與信件完全一致。
 */

const firebaseConfig = {
    apiKey: "AIzaSyDplIrzsJEHIpFTS7HdqeojHV38Le_vAgA",
    authDomain: "rental-b60e1.firebaseapp.com",
    projectId: "rental-b60e1",
    storageBucket: "rental-b60e1.firebasestorage.app",
    messagingSenderId: "721096991036",
    appId: "1:721096991036:web:cc868cb9d618ea77573e39"
};

// 初始化 Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// EmailJS 初始化 (使用定案版 Key)
const EMAILJS_PUBLIC_KEY = '2NlEiWtXcW05Awbjt';
if (typeof emailjs !== 'undefined') {
    emailjs.init(EMAILJS_PUBLIC_KEY);
}

let currentEvent = null;
let registrationsCount = 0;
let eventId = new URLSearchParams(window.location.search).get('id');

document.addEventListener('DOMContentLoaded', () => {
    if (!eventId) {
        alert("找不到活動 ID");
        location.href = 'index.html';
        return;
    }
    loadEventData();
    setupForm();
});

async function loadEventData() {
    try {
        // 監聽活動資料
        db.collection("events").doc(eventId).onSnapshot((doc) => {
            if (!doc.exists) {
                alert("活動不存在");
                location.href = 'index.html';
                return;
            }
            currentEvent = { id: doc.id, ...doc.data() };
            renderUI();
        });

        // 監聽報名人數 (定案版排除取消邏輯)
        db.collection("event_registrations").where("eventId", "==", eventId).onSnapshot((snapshot) => {
            let list = [];
            snapshot.forEach(d => list.push(d.data()));
            registrationsCount = list.filter(r => r.status !== 'cancelled').length;
            
            const cap = currentEvent ? (parseInt(currentEvent.capacity) || 0) : 0;
            const statusEl = document.getElementById('regStatus');
            if (statusEl) {
                statusEl.innerHTML = `<strong style="color:#8b5cf6; font-size:1.4rem;">${registrationsCount}</strong> / ${cap}`;
                
                // 額滿檢查
                const submitBtn = document.getElementById('submitBtn');
                if (registrationsCount >= cap && cap > 0) {
                    submitBtn.textContent = '名額已滿 (轉為遞補)';
                    submitBtn.style.background = 'linear-gradient(135deg, #64748b, #475569)';
                } else {
                    submitBtn.textContent = '確認報名';
                    submitBtn.style.background = 'linear-gradient(135deg, #7c3aed, #ec4899)';
                }
            }
        });

    } catch (error) {
        console.error("載入失敗:", error);
    }
}

function renderUI() {
    document.title = `${currentEvent.name} | 藝境空間`;
    document.getElementById('eventName').textContent = currentEvent.name;
    document.getElementById('eventDate').textContent = currentEvent.date;
    document.getElementById('eventTime').textContent = currentEvent.time;
    document.getElementById('eventLocation').textContent = currentEvent.location;
    document.getElementById('eventDescription').innerHTML = (currentEvent.description || '暫無說明').replace(/\n/g, '<br>');
    
    const imgEl = document.getElementById('eventImage');
    if (currentEvent.image) {
        imgEl.src = currentEvent.image;
    }
}

function setupForm() {
    const form = document.getElementById('regForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submitBtn');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = '提交中...';

        const name = document.getElementById('userName').value.trim();
        const phone = document.getElementById('userPhone').value.trim();
        const email = document.getElementById('userEmail').value.trim();

        const capacity = parseInt(currentEvent.capacity) || 0;
        const isWaitlist = (registrationsCount >= capacity);

        const regData = {
            eventId: eventId,
            eventName: currentEvent.name,
            userName: name,
            userPhone: phone,
            userEmail: email,
            status: isWaitlist ? 'waitlist' : 'registered',
            timestamp: new Date().toISOString()
        };

        try {
            const docRef = await db.collection("event_registrations").add(regData);
            
            // 呼叫定案版寄信邏輯
            sendRegistrationEmail({ id: docRef.id, ...regData });

            // 顯示定案版成功彈窗 (由 HTML 定義)
            showSuccessModal(isWaitlist);
        } catch (err) {
            console.error(err);
            alert("報名失敗，請稍後再試。");
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

// ---------------------------------------------------------
// 定案版：成功彈窗控制
// ---------------------------------------------------------
function showSuccessModal(isWaitlist) {
    const modal = document.getElementById('successModal');
    const titleEl = document.getElementById('successModalTitle');
    const descEl = document.getElementById('successModalDesc');
    
    if (isWaitlist) {
        titleEl.textContent = '候補登記成功！';
        descEl.innerHTML = '目前活動名額已滿，我們已為您登記候補。<br>若有名額釋出，系統將會發送候補成功通知信給您。';
    } else {
        titleEl.textContent = '報名成功！';
        descEl.innerHTML = '感謝您的參與，詳細資訊與報名序號已登錄。<br>系統已發送確認信至您的信箱，請查收。';
    }
    modal.style.display = 'flex';
}

function closeSuccessModal() {
    location.href = 'index.html';
}

// ---------------------------------------------------------
// 定案版：EmailJS 寄信邏輯與模板
// ---------------------------------------------------------
function sendRegistrationEmail(data) {
    if (typeof emailjs === 'undefined') return;

    const isWaitlist = (data.status === 'waitlist');
    const emailHtml = generateEventEmailHTML(data);

    const templateParams = {
        to_email: data.userEmail,
        to_name: data.userName,
        subject: isWaitlist ? `【候補登記成功通知】${data.eventName}` : `【活動報名成功通知】${data.eventName}`,
        message_html: emailHtml
    };

    emailjs.send('service_96agth6', 'template_uz1rccd', templateParams)
        .then(() => console.log("Email sent successfully"))
        .catch(err => console.error("Email failed:", err));
}

function generateEventEmailHTML(data) {
    const isWaitlist = (data.status === 'waitlist');
    const mainFont = 'system-ui, -apple-system, sans-serif';
    const primaryColor = '#8b5cf6';
    const accentColor = isWaitlist ? '#f59e0b' : '#10b981';
    
    return `
    <div style="background-color: #f8fafc; padding: 40px 20px; font-family: ${mainFont};">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(139, 92, 246, 0.1);">
            <div style="background: linear-gradient(135deg, #4f46e5, #ec4899); padding: 40px 20px; text-align: center; color: #ffffff;">
                <h1 style="margin: 0; font-size: 28px; letter-spacing: 4px; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">藝 境 空 間</h1>
                <p style="margin: 12px 0 0 0; font-size: 15px; opacity: 0.95; letter-spacing: 1px;">活動報名確認信</p>
            </div>
            <div style="padding: 40px; line-height: 1.6; color: #334155;">
                <p style="margin-bottom: 20px;">親愛的 <strong>${data.userName}</strong> 您好，</p>
                <p style="margin-bottom: 25px;">${isWaitlist ? '感謝您的參與！由於目前報名人數較多，您已進入<strong>候補名單</strong>。若有名額釋出，我們將優先為您安排並另行通知。' : `恭喜您！您已成功報名活動 <strong style="color: ${primaryColor};">${data.eventName}</strong>。以下是您的報名資訊：`}</p>
                
                <div style="background-color: #f8fafc; padding: 25px; border-radius: 8px; border-left: 5px solid ${accentColor}; margin-bottom: 30px;">
                    <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #1e293b;">📋 報名明細</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
                        <tr><td style="padding: 8px 0; color: #64748b; width: 100px;">報名狀態</td><td style="padding: 8px 0; font-weight: bold; color: ${accentColor};">${isWaitlist ? '候補中 (Waitlist)' : '報名成功 (Confirmed)'}</td></tr>
                        <tr><td style="padding: 8px 0; color: #64748b;">活動名稱</td><td style="padding: 8px 0; font-weight: bold; color: #1e293b;">${data.eventName}</td></tr>
                        <tr><td style="padding: 8px 0; color: #64748b;">報名序號</td><td style="padding: 8px 0; font-weight: bold; color: #1e293b;">${data.id.substring(0, 8).toUpperCase()}</td></tr>
                    </table>
                </div>
                <div style="text-align: center; border-top: 1px solid #f1f5f9; padding-top: 30px; margin-top: 20px;">
                    <h4 style="margin: 0; font-size: 18px; color: #1e293b;">期待在活動現場見到您！</h4>
                    <p style="margin: 15px 0 0 0; font-size: 14px; color: #94a3b8;">藝境空間 管理團隊 敬上</p>
                </div>
            </div>
        </div>
    </div>`;
}
