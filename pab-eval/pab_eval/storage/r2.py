"""Cloudflare R2 via boto3 S3-compatible API."""

from __future__ import annotations

import json
import os

import boto3

from pab_eval.errors import ConfigError
from pab_eval.storage.base import ObjectStore


class R2Store:
    def __init__(
        self,
        account_id: str,
        access_key: str,
        secret_key: str,
        bucket: str,
    ) -> None:
        self._bucket = bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",
        )

    @classmethod
    def from_env(cls) -> R2Store:
        def req(name: str) -> str:
            val = os.environ.get(name)
            if not val:
                raise ConfigError(f"missing environment variable: {name}")
            return val

        return cls(
            account_id=req("R2_ACCOUNT_ID"),
            access_key=req("R2_ACCESS_KEY_ID"),
            secret_key=req("R2_SECRET_ACCESS_KEY"),
            bucket=req("R2_BUCKET"),
        )

    def put_json(self, key: str, obj: dict) -> None:
        body = json.dumps(obj, default=str).encode("utf-8")
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=body,
            ContentType="application/json",
        )

    def get_json(self, key: str) -> dict:
        try:
            resp = self._client.get_object(Bucket=self._bucket, Key=key)
        except self._client.exceptions.NoSuchKey:
            raise KeyError(key) from None
        except Exception as exc:
            if exc.__class__.__name__ == "NoSuchKey":
                raise KeyError(key) from None
            raise
        data = json.loads(resp["Body"].read().decode("utf-8"))
        if not isinstance(data, dict):
            raise KeyError(key)
        return data

    def put_text(self, key: str, text: str, content_type: str) -> None:
        self._client.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=text.encode("utf-8"),
            ContentType=content_type,
        )

    def get_text(self, key: str) -> str:
        try:
            resp = self._client.get_object(Bucket=self._bucket, Key=key)
        except Exception as exc:
            if exc.__class__.__name__ == "NoSuchKey":
                raise KeyError(key) from None
            raise
        return resp["Body"].read().decode("utf-8")

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)

    def delete_prefix(self, prefix: str) -> int:
        count = 0
        token: str | None = None
        while True:
            kwargs: dict = {"Bucket": self._bucket, "Prefix": prefix}
            if token:
                kwargs["ContinuationToken"] = token
            resp = self._client.list_objects_v2(**kwargs)
            contents = resp.get("Contents", [])
            if contents:
                self._client.delete_objects(
                    Bucket=self._bucket,
                    Delete={"Objects": [{"Key": o["Key"]} for o in contents]},
                )
                count += len(contents)
            if not resp.get("IsTruncated"):
                break
            token = resp.get("NextContinuationToken")
        return count

    def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
            return True
        except Exception:
            return False

    def list_keys(self, prefix: str) -> list[str]:
        keys: list[str] = []
        token: str | None = None
        while True:
            kwargs: dict = {"Bucket": self._bucket, "Prefix": prefix}
            if token:
                kwargs["ContinuationToken"] = token
            resp = self._client.list_objects_v2(**kwargs)
            keys.extend(o["Key"] for o in resp.get("Contents", []))
            if not resp.get("IsTruncated"):
                break
            token = resp.get("NextContinuationToken")
        return sorted(keys)

    def list_keys_page(
        self, prefix: str, *, limit: int, start_after: str | None = None
    ) -> tuple[list[str], bool]:
        kwargs: dict = {"Bucket": self._bucket, "Prefix": prefix, "MaxKeys": limit}
        if start_after:
            kwargs["StartAfter"] = start_after
        resp = self._client.list_objects_v2(**kwargs)
        page = [o["Key"] for o in resp.get("Contents", [])]
        return page, bool(resp.get("IsTruncated"))
