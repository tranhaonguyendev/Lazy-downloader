# Publish (npm)

## Chuẩn bị

1) Tạo npm token (automation token khuyến nghị).
2) Thêm GitHub Secret:

- `NPM_TOKEN`

## Release theo tag

Workflow/pipeline có thể chạy khi push tag dạng `v*`.

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Notes

- Version trong `package.json` phải khớp tag.
- Nếu trùng tên package, đổi `name`.
