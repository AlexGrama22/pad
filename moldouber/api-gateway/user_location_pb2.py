# -*- coding: utf-8 -*-
# Generated by the protocol buffer compiler.  DO NOT EDIT!
# NO CHECKED-IN PROTOBUF GENCODE
# source: user_location.proto
# Protobuf Python Version: 5.27.2
"""Generated protocol buffer code."""
from google.protobuf import descriptor as _descriptor
from google.protobuf import descriptor_pool as _descriptor_pool
from google.protobuf import runtime_version as _runtime_version
from google.protobuf import symbol_database as _symbol_database
from google.protobuf.internal import builder as _builder
_runtime_version.ValidateProtobufRuntimeVersion(
    _runtime_version.Domain.PUBLIC,
    5,
    27,
    2,
    '',
    'user_location.proto'
)
# @@protoc_insertion_point(imports)

_sym_db = _symbol_database.Default()




DESCRIPTOR = _descriptor_pool.Default().AddSerializedFile(b'\n\x13user_location.proto\x12\x0cuserLocation\"\x1d\n\x0bUserRequest\x12\x0e\n\x06userId\x18\x01 \x01(\t\"G\n\x10LocationResponse\x12\x0e\n\x06userId\x18\x01 \x01(\t\x12\x10\n\x08latitude\x18\x02 \x01(\x02\x12\x11\n\tlongitude\x18\x03 \x01(\x02\x32\x62\n\x13UserLocationService\x12K\n\x0cSendLocation\x12\x19.userLocation.UserRequest\x1a\x1e.userLocation.LocationResponse\"\x00\x62\x06proto3')

_globals = globals()
_builder.BuildMessageAndEnumDescriptors(DESCRIPTOR, _globals)
_builder.BuildTopDescriptorsAndMessages(DESCRIPTOR, 'user_location_pb2', _globals)
if not _descriptor._USE_C_DESCRIPTORS:
  DESCRIPTOR._loaded_options = None
  _globals['_USERREQUEST']._serialized_start=37
  _globals['_USERREQUEST']._serialized_end=66
  _globals['_LOCATIONRESPONSE']._serialized_start=68
  _globals['_LOCATIONRESPONSE']._serialized_end=139
  _globals['_USERLOCATIONSERVICE']._serialized_start=141
  _globals['_USERLOCATIONSERVICE']._serialized_end=239
# @@protoc_insertion_point(module_scope)