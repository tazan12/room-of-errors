# SafeEye 3D 자산 (CDN 배포용)

SafeEye 환자안전 병실 관찰 실습 사이트(roe-integrated.tazan12.workers.dev)의 3D 병실 모델과 걷기 탐색(Unity WebGL) 빌드입니다.
사이트는 이 폴더의 파일을 jsDelivr(서울 서버)로 받아 3D 화면을 빠르게 엽니다. CDN을 쓸 수 없으면 사이트 서버에서 같은 파일을 받습니다.

- `rooms/*.glb` — 마우스 3D 보기용 병실 모델
- `rooms/*.u.glb` — 걷기 탐색용 병실 모델
- `unity/Build/` — 걷기 탐색 Unity 빌드(브로틀리 압축)

파일을 바꾸면 사이트의 CDN 커밋 번호도 함께 바꿉니다.
