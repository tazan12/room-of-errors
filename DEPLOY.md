# 배포 가이드 — Room of Errors

이 앱은 **Node.js 서버**(API·채점·세션·내보내기·관리자)가 필요합니다. 정적 호스팅만으로는 동작하지 않습니다.

---

## 방법 1. 교내 LAN (계정 불필요 · 즉시)
수업 실습에 가장 간단합니다. 선생님 PC에서 서버를 켜고 학생들이 같은 Wi-Fi로 접속합니다.

```bash
cd "C:\Users\tazan\Desktop\Room_of_Errors_추가사례4종_패키지\room-of-errors-app\backend"
node server.js
```

- 선생님 PC 접속: http://localhost:3000
- 학생(같은 Wi-Fi) 접속: **http://172.30.1.68:3000**  ← 이 PC의 현재 LAN IP
- 방화벽에서 최초 1회 "액세스 허용"을 눌러야 할 수 있습니다(포트 3000, 사설 네트워크).
- IP는 네트워크가 바뀌면 달라집니다. 확인: PowerShell `ipconfig`.

관리자 코드 변경(선택):
```bash
$env:ADMIN_CODE="원하는코드"; node server.js
```

---

## 방법 2. Render (무료 클라우드 · 공개 URL)
공개 주소가 필요할 때. GitHub + Render 계정(무료)이 필요합니다.

1. GitHub에 이 `room-of-errors-app` 폴더를 저장소로 push
   ```bash
   cd room-of-errors-app
   git init && git add . && git commit -m "Room of Errors"
   git branch -M main
   git remote add origin https://github.com/<사용자>/room-of-errors.git
   git push -u origin main
   ```
2. https://render.com → New → **Blueprint** → 위 저장소 선택 (루트의 `render.yaml` 자동 인식)
3. 환경변수 `ADMIN_CODE`에 원하는 관리자 코드 입력 → Deploy
4. 몇 분 뒤 `https://room-of-errors.onrender.com` 형태의 공개 URL 발급

> 주의: 무료 플랜은 유휴 시 잠들고, 재배포 시 세션 데이터(`store/data.json`)가 초기화됩니다. 채점 결과는 수업 종료 전 **관리자 대시보드에서 Excel/CSV로 내보내기** 하세요.

---

## 방법 3. Docker (자체 서버·NAS 등)
```bash
cd room-of-errors-app
docker build -t room-of-errors .
docker run -d -p 3000:3000 -e ADMIN_CODE="원하는코드" --name roe room-of-errors
```
접속: http://서버IP:3000

---

## 데이터 영속성 참고
현재 세션·채점은 `backend/store/data.json`(파일)에 저장됩니다.
- LAN·Docker(볼륨)·자체 서버: 유지됨
- Render/서버리스 무료 플랜: 재배포 시 초기화 → 내보내기로 백업
- 향후 영구 보관이 필요하면 PostgreSQL 등 DB로 교체 가능(`store/db.js` 인터페이스만 교체).
